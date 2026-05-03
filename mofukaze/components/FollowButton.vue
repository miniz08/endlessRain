<template>
  <button :class="{ primary: !localFollowing }" :disabled="busy || isSelf" @click="toggleFollow">
    {{ label }}
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{
  userId: number;
  following?: boolean;
  articleId?: number;
}>();

const emit = defineEmits<{
  changed: [following: boolean];
}>();

const { user, isLoggedIn } = useAuth();
const { blogApi } = useApi();
const busy = ref(false);
const localFollowing = ref(Boolean(props.following));

watch(
  () => props.following,
  (value) => {
    localFollowing.value = Boolean(value);
  },
);

const isSelf = computed(() => user.value?.id === props.userId);
const label = computed(() => {
  if (isSelf.value) return "自己";
  if (busy.value) return "处理中";
  return localFollowing.value ? "已关注" : "关注";
});

async function toggleFollow() {
  if (!isLoggedIn.value || isSelf.value || busy.value) return;
  busy.value = true;
  try {
    if (localFollowing.value) {
      await blogApi(`/users/${props.userId}/follow`, { method: "DELETE" });
      localFollowing.value = false;
    } else {
      await blogApi(`/users/${props.userId}/follow`, {
        method: "POST",
        body: props.articleId ? { articleId: props.articleId } : {},
      });
      localFollowing.value = true;
    }
    emit("changed", localFollowing.value);
  } finally {
    busy.value = false;
  }
}
</script>
