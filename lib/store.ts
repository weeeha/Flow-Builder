"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { MODEL_KINDS, layoutGraph, toNodeData, type FlowDoc, type ModelKind } from "./flow-doc";
import { handleId, parseHandleId } from "./handles";
import { initialData } from "./node-kinds";
import type { FlowEdge, FlowNode, NodeKind, NodeStatus, ReferenceNodeData } from "./types";

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => string;
  /**
   * Place a reference node for a dropped clip. Kept apart from addNode: only the
   * drop pipeline builds one, never the toolbar.
   */
  addReference: (position: { x: number; y: number }, data: Partial<ReferenceNodeData>) => string;
  /**
   * Add a graph document beside what is on the canvas, laid out from `origin`.
   * Returns the new id of each document node, keyed by its document id.
   */
  loadGraph: (doc: FlowDoc, opts: { origin: { x: number; y: number } }) => Record<string, string>;
  updateNodeData: (id: string, data: Partial<FlowNode["data"]>) => void;
  setNodeStatus: (id: string, status: NodeStatus, error?: string) => void;
  deleteNode: (id: string) => void;
  reset: () => void;
}

let nodeCounter = 0;
const nextId = (kind: NodeKind) => `${kind}-${++nodeCounter}-${Date.now().toString(36)}`;

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) as FlowNode[] });
      },
      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },
      onConnect: (connection) => {
        set({
          edges: addEdge(
            { ...connection, animated: false, style: { stroke: "#94a3b8" } },
            get().edges
          ),
        });
      },
      addNode: (kind, position) => {
        const id = nextId(kind);
        const newNode = {
          id,
          type: kind,
          position,
          data: initialData(kind),
        } as FlowNode;
        set({ nodes: [...get().nodes, newNode] });
        return id;
      },
      addReference: (position, data) => {
        const id = nextId("reference");
        const node: FlowNode = {
          id,
          type: "reference",
          position,
          data: { ...initialData("reference"), ...data },
        };
        set({ nodes: [...get().nodes, node] });
        return id;
      },
      loadGraph: (doc, { origin }) => {
        const at = layoutGraph(doc, origin);
        const ids: Record<string, string> = {};
        const nodes: FlowNode[] = [];
        for (const node of doc.nodes) {
          // validateGraph rejects these; loading stays safe on a graph it never saw.
          if (!(MODEL_KINDS as readonly string[]).includes(node.kind)) continue;
          const kind = node.kind as ModelKind;
          ids[node.id] = nextId(kind);
          nodes.push({
            id: ids[node.id],
            type: kind,
            position: at[node.id],
            data: toNodeData(kind, node.data),
          } as FlowNode);
        }

        const edges: FlowEdge[] = [];
        for (const edge of doc.edges) {
          const from = parseHandleId(edge.sourceHandle);
          const to = parseHandleId(edge.targetHandle);
          const source = ids[edge.source];
          const target = ids[edge.target];
          if (!from || !to || !source || !target) continue;
          const sourceHandle = handleId(source, from.type, from.port);
          const targetHandle = handleId(target, to.type, to.port);
          edges.push({
            id: `${sourceHandle}->${targetHandle}`,
            source,
            target,
            sourceHandle,
            targetHandle,
            animated: false,
            style: { stroke: "#94a3b8" },
          });
        }

        set({ nodes: [...get().nodes, ...nodes], edges: [...get().edges, ...edges] });
        return ids;
      },
      updateNodeData: (id, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n
          ),
        });
      },
      setNodeStatus: (id, status, error) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === id
              ? ({ ...n, data: { ...n.data, status, error } } as FlowNode)
              : n
          ),
        });
      },
      deleteNode: (id) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        });
      },
      reset: () => set({ nodes: [], edges: [] }),
    }),
    {
      name: "flow-builder-state",
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
    }
  )
);
