import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "./inspector";
import { initialData } from "@/lib/node-kinds";
import { useFlowStore } from "@/lib/store";
import type { FlowNode, NodeKind } from "@/lib/types";

const node = (kind: NodeKind, id: string, selected = false): FlowNode =>
  ({ id, type: kind, position: { x: 0, y: 0 }, selected, data: initialData(kind) }) as FlowNode;

const seed = (...nodes: FlowNode[]) => useFlowStore.setState({ nodes, edges: [] });
const dataOf = (id: string) => useFlowStore.getState().nodes.find((n) => n.id === id)!.data;

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [] });
});

describe("Inspector", () => {
  it("stays out of the way when nothing is selected", () => {
    seed(node("video", "video-1"));
    const { container } = render(<Inspector />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays out of the way when several nodes are selected", () => {
    seed(node("video", "video-1", true), node("image", "image-1", true));
    const { container } = render(<Inspector />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the selected kind and offers its inspector fields", () => {
    seed(node("video", "video-1", true));
    render(<Inspector />);
    expect(screen.getByRole("heading", { name: "Video" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Duration" })).toBeInTheDocument();
  });

  it("leaves the prompt on the card", () => {
    seed(node("video", "video-1", true));
    render(<Inspector />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the value the node currently holds", () => {
    seed(node("tts", "tts-1", true));
    render(<Inspector />);
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveTextContent("Rachel");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "Eleven Multilingual v2"
    );
  });

  it("writes a picked option to the node, keeping a numeric field numeric", async () => {
    seed(node("video", "video-1", true));
    render(<Inspector />);
    await userEvent.click(screen.getByRole("combobox", { name: "Duration" }));
    await userEvent.click(await screen.findByRole("option", { name: "8s" }));
    expect(dataOf("video-1").duration).toBe(8);
  });

  it("writes a picked model as the id the route expects", async () => {
    seed(node("image", "image-1", true));
    render(<Inspector />);
    await userEvent.click(screen.getByRole("combobox", { name: "Model" }));
    await userEvent.click(await screen.findByRole("option", { name: /Nano Banana/ }));
    expect(dataOf("image-1").model).toBe("nano-banana");
  });

  it("says so for a kind with nothing to configure yet", () => {
    seed(node("composition", "composition-1", true));
    render(<Inspector />);
    expect(screen.getByRole("heading", { name: "Composition" })).toBeInTheDocument();
    expect(screen.getByText(/nothing to configure/i)).toBeInTheDocument();
  });

  it("does not trap focus, so the canvas stays reachable", () => {
    seed(node("video", "video-1", true));
    render(<Inspector />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(document.querySelector("[data-radix-focus-guard]")).toBeNull();
  });
});
