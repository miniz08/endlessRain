import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { renderLatexElement } from "~/utils/latex";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    latex: {
      insertLatex: (attrs: { latex: string }) => ReturnType;
    };
  }
}

export const LatexNode = Node.create({
  name: "latex",

  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-latex") || element.textContent?.replace(/^\$|\$$/g, "") || "",
        renderHTML: (attributes) => ({
          "data-latex": attributes.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="latex"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "latex-node",
        "data-type": "latex",
      }),
      `$${node.attrs.latex}$`,
    ];
  },

  addCommands() {
    return {
      insertLatex:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "latex-node";
      dom.dataset.type = "latex";
      dom.contentEditable = "false";

      const render = () => {
        renderLatexElement(dom, node.attrs.latex);
      };

      dom.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const position = typeof getPos === "function" ? getPos() : undefined;
        if (typeof position === "number") {
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
        }

        window.dispatchEvent(
          new CustomEvent("mofukaze:edit-latex", {
            detail: {
              latex: node.attrs.latex,
              pos: position,
            },
          }),
        );
      });

      render();

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render();
          return true;
        },
        selectNode: () => dom.classList.add("is-selected"),
        deselectNode: () => dom.classList.remove("is-selected"),
      };
    };
  },
});
