<template>
  <div class="tiptap-editor">
    <div class="tiptap-surface" :class="{ disabled }">
      <EditorContent v-if="editor" class="tiptap-content" :editor="editor" />
    </div>

    <div v-if="editor" class="tiptap-toolbar" aria-label="编辑器工具栏">
      <div class="toolbar-group">
        <button type="button" title="加粗" :class="{ active: editor.isActive('bold') }" :disabled="disabled" @click="run('toggleBold')">B</button>
        <button type="button" title="斜体" :class="{ active: editor.isActive('italic') }" :disabled="disabled" @click="run('toggleItalic')">I</button>
        <button type="button" title="删除线" :class="{ active: editor.isActive('strike') }" :disabled="disabled" @click="run('toggleStrike')">S</button>
      </div>

      <div class="toolbar-group">
        <button type="button" title="一级标题" :class="{ active: editor.isActive('heading', { level: 1 }) }" :disabled="disabled" @click="toggleHeading(1)">H1</button>
        <button type="button" title="二级标题" :class="{ active: editor.isActive('heading', { level: 2 }) }" :disabled="disabled" @click="toggleHeading(2)">H2</button>
        <button type="button" title="三级标题" :class="{ active: editor.isActive('heading', { level: 3 }) }" :disabled="disabled" @click="toggleHeading(3)">H3</button>
      </div>

      <div class="toolbar-group">
        <button type="button" title="无序列表" :class="{ active: editor.isActive('bulletList') }" :disabled="disabled" @click="run('toggleBulletList')">UL</button>
        <button type="button" title="有序列表" :class="{ active: editor.isActive('orderedList') }" :disabled="disabled" @click="run('toggleOrderedList')">OL</button>
        <button type="button" title="引用" :class="{ active: editor.isActive('blockquote') }" :disabled="disabled" @click="run('toggleBlockquote')">“”</button>
        <button type="button" title="代码块" :class="{ active: editor.isActive('codeBlock') }" :disabled="disabled" @click="run('toggleCodeBlock')">Code</button>
      </div>

      <div class="toolbar-group">
        <button type="button" title="链接" :class="{ active: editor.isActive('link') }" :disabled="disabled" @click="addLink">Link</button>
        <button type="button" title="LaTeX 公式" :class="{ active: latexOpen }" :disabled="disabled" @click="openLatexInput()">LaTeX</button>
        <button type="button" title="插入图片" :disabled="disabled || Boolean(uploadingKind)" @click="pickImage('article')">
          {{ uploadingKind === "article" ? "上传中" : "图片" }}
        </button>
        <button type="button" title="插入表情包" :disabled="disabled || Boolean(uploadingKind)" @click="pickImage('sticker')">
          {{ uploadingKind === "sticker" ? "上传中" : "表情包" }}
        </button>
      </div>

      <div class="toolbar-group">
        <button type="button" title="撤销" :disabled="disabled || !editor.can().chain().focus().undo().run()" @click="run('undo')">Undo</button>
        <button type="button" title="重做" :disabled="disabled || !editor.can().chain().focus().redo().run()" @click="run('redo')">Redo</button>
        <button type="button" title="水平线" :disabled="disabled" @click="run('setHorizontalRule')">HR</button>
        <button type="button" title="清除格式" :disabled="disabled" @click="clearFormatting">清除</button>
      </div>
    </div>

    <div v-if="latexOpen" class="latex-input-panel">
      <textarea
        ref="latexInput"
        v-model="latexSource"
        class="latex-input"
        placeholder="E = mc^2"
        rows="3"
        @keydown.ctrl.enter.prevent="applyLatex"
        @keydown.meta.enter.prevent="applyLatex"
        @keydown.esc.prevent="closeLatexInput"
      />
      <div class="latex-preview" v-html="latexPreviewHtml"></div>
      <div class="latex-actions">
        <button type="button" class="primary" @click="applyLatex">插入</button>
        <button type="button" class="ghost" @click="closeLatexInput">取消</button>
      </div>
    </div>

    <div class="tiptap-status">
      <span v-if="localError" class="error">{{ localError }}</span>
      <span class="muted">{{ characterCount }} / {{ maxLength }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Extension } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { LatexNode } from "./latexNode";
import { renderLatexToHtml } from "~/utils/latex";

type UploadKind = "article" | "sticker";
type LatexEditEvent = CustomEvent<{ latex?: string; pos?: number }>;

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    maxLength?: number;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    maxLength: 10000,
    placeholder: "写下你想分享的内容",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const { uploadImage } = useMediaUpload();
const htmlSnapshot = ref(props.modelValue);
const textSnapshot = ref("");
const uploadingKind = ref<"" | UploadKind>("");
const localError = ref("");
const latexOpen = ref(false);
const latexSource = ref("");
const latexEditPos = ref<number | null>(null);
const latexInput = ref<HTMLTextAreaElement | null>(null);

const disabled = computed(() => props.disabled || Boolean(uploadingKind.value));
const characterCount = computed(() => Array.from(textSnapshot.value).length);
const latexPreviewHtml = computed(() => (latexSource.value.trim() ? renderLatexToHtml(latexSource.value) : ""));

const CustomShortcuts = Extension.create({
  name: "customShortcuts",
  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.chain().focus().toggleBold().run(),
      "Mod-i": () => this.editor.chain().focus().toggleItalic().run(),
      "Mod-z": () => this.editor.chain().focus().undo().run(),
      "Mod-Shift-z": () => this.editor.chain().focus().redo().run(),
      "Mod-1": () => this.editor.chain().focus().toggleHeading({ level: 1 }).run(),
      "Mod-2": () => this.editor.chain().focus().toggleHeading({ level: 2 }).run(),
      "Mod-3": () => this.editor.chain().focus().toggleHeading({ level: 3 }).run(),
      "Mod-Shift-l": () => openLatexInput(),
      "Mod-k": () => addLink(),
    };
  },
});

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Image.configure({
      allowBase64: false,
    }),
    Link.configure({
      openOnClick: false,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    CharacterCount.configure({
      limit: props.maxLength,
    }),
    LatexNode,
    CustomShortcuts,
  ],
  content: props.modelValue,
  editorProps: {
    attributes: {
      class: "tiptap-prose",
      "aria-label": "文章编辑器",
    },
  },
  editable: !props.disabled,
  onUpdate: ({ editor }) => {
    updateSnapshots();
    emit("update:modelValue", editor.getHTML());
  },
  onCreate: () => {
    updateSnapshots();
  },
});

watch(
  () => props.disabled,
  (value) => {
    editor.value?.setEditable(!value);
  },
);

watch(
  () => props.modelValue,
  (value) => {
    const next = value ?? "";
    if (editor.value && editor.value.getHTML() !== next) {
      editor.value.commands.setContent(next);
      updateSnapshots();
    }
  },
);

onMounted(() => {
  window.addEventListener("mofukaze:edit-latex", handleLatexEdit);
});

onBeforeUnmount(() => {
  window.removeEventListener("mofukaze:edit-latex", handleLatexEdit);
  editor.value?.destroy();
});

function updateSnapshots() {
  htmlSnapshot.value = editor.value?.getHTML() ?? "";
  textSnapshot.value = editor.value?.getText() ?? "";
}

function run(command: "toggleBold" | "toggleItalic" | "toggleStrike" | "toggleBulletList" | "toggleOrderedList" | "toggleBlockquote" | "toggleCodeBlock" | "undo" | "redo" | "setHorizontalRule") {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  chain[command]().run();
}

function toggleHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}

function clearFormatting() {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run();
}

function addLink() {
  if (!import.meta.client || !editor.value) return true;
  const previous = editor.value.getAttributes("link").href as string | undefined;
  const url = window.prompt("请输入链接 URL", previous ?? "");
  if (url === null) return true;
  if (!url.trim()) {
    editor.value.chain().focus().extendMarkRange("link").unsetLink().run();
    return true;
  }
  editor.value.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  return true;
}

function getSelectedLatexSource() {
  if (!editor.value) return "";
  const { from, to, empty } = editor.value.state.selection;
  return empty ? "" : editor.value.state.doc.textBetween(from, to, " ");
}

function openLatexInput(source?: string, pos: number | null = null) {
  latexSource.value = source ?? getSelectedLatexSource();
  latexEditPos.value = pos;
  latexOpen.value = true;
  nextTick(() => {
    latexInput.value?.focus();
    latexInput.value?.select();
  });
  return true;
}

function closeLatexInput() {
  latexOpen.value = false;
  latexSource.value = "";
  latexEditPos.value = null;
  editor.value?.commands.focus();
}

function updateLatexAtPosition(pos: number, latex: string) {
  return editor.value?.commands.command(({ tr }) => {
    const node = tr.doc.nodeAt(pos);
    if (node?.type.name !== "latex") return false;
    tr.setNodeMarkup(pos, undefined, { latex });
    return true;
  });
}

function applyLatex() {
  const source = latexSource.value.trim();
  if (!source || !editor.value) return;
  const updated = latexEditPos.value !== null && updateLatexAtPosition(latexEditPos.value, source);
  if (!updated) {
    editor.value.chain().focus().insertLatex({ latex: source }).run();
  }
  closeLatexInput();
}

function handleLatexEdit(event: Event) {
  const { latex = "", pos } = (event as LatexEditEvent).detail || {};
  openLatexInput(latex, typeof pos === "number" ? pos : null);
}

function pickImage(kind: UploadKind) {
  if (!import.meta.client || uploadingKind.value) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/webp";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void uploadAndInsertImage(file, kind);
  };
  input.click();
}

async function uploadAndInsertImage(file: File, kind: UploadKind) {
  uploadingKind.value = kind;
  localError.value = "";
  try {
    const payload = await uploadImage(file, kind);
    editor.value
      ?.chain()
      .focus()
      .setImage({
        src: payload.media.url,
        alt: kind === "sticker" ? "表情包" : "图片",
      })
      .run();
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "图片上传失败";
  } finally {
    uploadingKind.value = "";
  }
}

function isEditorEmpty() {
  const hasMedia = /<(img|video|audio)\b/i.test(htmlSnapshot.value) || /data-type=["']latex["']/i.test(htmlSnapshot.value);
  return !textSnapshot.value.trim() && !hasMedia;
}

function clear() {
  editor.value?.commands.clearContent();
  updateSnapshots();
  emit("update:modelValue", "");
}

defineExpose({
  focus: () => editor.value?.commands.focus(),
  clear,
  getHTML: () => editor.value?.getHTML() ?? "",
  getText: () => editor.value?.getText() ?? "",
  isEmpty: isEditorEmpty,
});
</script>
