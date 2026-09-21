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
import type {
  CompositionNodeData,
  FlowEdge,
  FlowNode,
  ImageNodeData,
  NodeKind,
  NodeStatus,
  TTSNodeData,
  VideoNodeData,
} from "./types";

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => string;
  updateNodeData: (id: string, data: Partial<FlowNode["data"]>) => void;
  setNodeStatus: (id: string, status: NodeStatus, error?: string) => void;
  deleteNode: (id: string) => void;
  reset: () => void;
}

let nodeCounter = 0;
const nextId = (kind: NodeKind) => `${kind}-${++nodeCounter}-${Date.now().toString(36)}`;

const defaultData: Record<NodeKind, FlowNode["data"]> = {
  image: {
    status: "idle",
    prompt: "",
    model: "flux-dev",
  } satisfies ImageNodeData,
  video: {
    status: "idle",
    prompt: "",
    model: "seedance-2.0",
    duration: 4,
  } satisfies VideoNodeData,
  tts: {
    status: "idle",
    prompt: "",
    voice: "Rachel",
    model: "eleven_multilingual_v2",
  } satisfies TTSNodeData,
  composition: {
    status: "idle",
  } satisfies CompositionNodeData,
};

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
          data: { ...defaultData[kind] },
        } as FlowNode;
        set({ nodes: [...get().nodes, newNode] });
        return id;
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
