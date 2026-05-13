<template>
  <div class="page">
    <div class="grid">
      <section class="stack">
        <div v-if="profile" class="panel">
          <div class="row" style="justify-content: space-between">
            <div class="row">
              <span class="avatar">
                <img v-if="profile.avatar" :src="profile.avatar" alt="" />
                <span v-else>{{ profile.username.slice(0, 1).toUpperCase() }}</span>
              </span>
              <div>
                <h2 style="margin: 0">{{ profile.username }}</h2>
                <p class="muted" style="margin: 4px 0 0">专业度 {{ profile.professionalism }} / 友好度 {{ profile.friendliness }}</p>
              </div>
            </div>
            <div class="row">
              <button v-if="canChat" class="primary" @click="openChat">私聊</button>
              <FollowButton v-if="!isOwnProfile" :user-id="profile.id" :following="summary?.followedByMe" @changed="loadSummary" />
            </div>
          </div>
          <p v-if="profile.bio" class="profile-bio">{{ profile.bio }}</p>
          <p v-else class="profile-bio muted">这个人还没有填写个人简介。</p>
          <div v-if="isOwnProfile" class="profile-editor">
            <textarea v-model="bioDraft" maxlength="280" placeholder="介绍一下自己" />
            <div class="composer-actions">
              <span class="muted">{{ bioLength }} / 280</span>
              <button type="button" class="ghost" :disabled="avatarUploading" @click="pickAvatar">
                {{ avatarUploading ? "上传中" : "更换头像" }}
              </button>
              <button type="button" class="primary" :disabled="savingBio" @click="saveBio">
                {{ savingBio ? "保存中" : "保存简介" }}
              </button>
              <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="handleAvatarUpload" />
            </div>
            <p v-if="profileError" class="error">{{ profileError }}</p>
          </div>
        </div>

        <div class="panel">
          <div class="tabs">
            <button :class="{ active: activeList === 'followers' }" @click="switchList('followers')">
              粉丝 {{ summary?.followerCount ?? 0 }}
            </button>
            <button :class="{ active: activeList === 'following' }" @click="switchList('following')">
              关注 {{ summary?.followingCount ?? 0 }}
            </button>
          </div>
          <div class="user-list">
            <div v-for="item in relationItems" :key="item.user.id" class="user-item">
              <NuxtLink class="row" :to="`/u/${item.user.id}`">
                <span class="avatar">
                  <img v-if="item.user.avatar" :src="item.user.avatar" alt="" />
                  <span v-else>{{ item.user.username.slice(0, 1).toUpperCase() }}</span>
                </span>
                <span>{{ item.user.username }}</span>
              </NuxtLink>
              <FollowButton :user-id="item.user.id" :following="item.user.followedByMe" @changed="loadRelations" />
            </div>
            <div v-if="relationItems.length === 0" class="empty">暂无数据</div>
          </div>
        </div>
      </section>

      <aside class="stack">
        <div class="panel">
          <h3>综合评级</h3>
          <p v-if="rating" class="muted">
            等级 {{ rating.computed.level }} / 综合分 {{ rating.computed.combinedScore }}
          </p>
          <p v-if="rating" class="muted">
            内容 {{ rating.computed.contentQualityScore }} / 合规 {{ rating.computed.complianceScore }} / 反馈 {{ rating.computed.feedbackScore }}
          </p>
          <div v-if="rating?.computed.signals.length" class="tags">
            <span v-for="signal in rating.computed.signals" :key="signal" class="tag">{{ signal }}</span>
          </div>
          <p v-else class="muted">暂无足够行为数据。</p>
        </div>
        <div class="panel">
          <h3>关系概览</h3>
          <p class="muted">关注关系会参与关注时间线，关注作者事件会进入推荐画像的作者亲和度。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicUser } from "~/types/social";

type RelationItem = {
  user: PublicUser & { followedByMe: boolean };
};

type Summary = {
  userId: number;
  followingCount: number;
  followerCount: number;
  followedByMe: boolean;
};

type Rating = {
  computed: {
    contentQualityScore: number;
    complianceScore: number;
    feedbackScore: number;
    combinedScore: number;
    level: "A" | "B" | "C" | "D";
    signals: string[];
  };
};

type ListType = "followers" | "following";

const route = useRoute();
const userId = computed(() => Number(route.params.id));
const { blogApi, userApi } = useApi();
const { user, refreshMe } = useAuth();
const { uploadAvatar } = useMediaUpload();
const profile = ref<PublicUser | null>(null);
const summary = ref<Summary | null>(null);
const rating = ref<Rating | null>(null);
const relationItems = ref<RelationItem[]>([]);
const activeList = ref<ListType>("followers");
const avatarInput = ref<HTMLInputElement | null>(null);
const bioDraft = ref("");
const savingBio = ref(false);
const avatarUploading = ref(false);
const profileError = ref("");
const isOwnProfile = computed(() => Boolean(profile.value && user.value?.id === profile.value.id));
const canChat = computed(() => Boolean(profile.value && (!user.value || user.value.id !== profile.value.id)));
const bioLength = computed(() => Array.from(bioDraft.value).length);

onMounted(async () => {
  await refreshMe();
  await Promise.all([loadProfile(), loadSummary(), loadRelations(), loadRating()]);
});

watch(userId, async () => {
  await Promise.all([loadProfile(), loadSummary(), loadRelations(), loadRating()]);
});

watch(
  profile,
  (value) => {
    bioDraft.value = value?.bio ?? "";
    profileError.value = "";
  },
  { immediate: true },
);

async function loadProfile() {
  const payload = await userApi<{ user: PublicUser }>(`/users/${userId.value}`);
  profile.value = payload.user;
}

async function loadSummary() {
  const payload = await blogApi<{ summary: Summary }>(`/users/${userId.value}/follow-summary`);
  summary.value = payload.summary;
}

async function loadRating() {
  const payload = await userApi<{ rating: Rating }>(`/users/${userId.value}/rating`);
  rating.value = payload.rating;
}

async function loadRelations() {
  const path = activeList.value === "followers" ? "/followers" : "/following";
  const payload = await blogApi<{ items: RelationItem[] }>(`${path}?userId=${userId.value}&limit=50`);
  relationItems.value = payload.items;
}

async function switchList(type: ListType) {
  activeList.value = type;
  await loadRelations();
}

async function openChat() {
  if (!profile.value) return;
  if (!user.value) {
    await navigateTo("/login");
    return;
  }
  await navigateTo(`/chat?userId=${profile.value.id}`);
}

async function saveBio() {
  savingBio.value = true;
  profileError.value = "";
  try {
    const payload = await userApi<{ user: PublicUser }>("/users/me", {
      method: "PATCH",
      body: { bio: bioDraft.value },
    });
    profile.value = payload.user;
    user.value = payload.user;
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : "简介保存失败";
  } finally {
    savingBio.value = false;
  }
}

function pickAvatar() {
  avatarInput.value?.click();
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  avatarUploading.value = true;
  profileError.value = "";
  const currentDraft = bioDraft.value;
  try {
    const payload = await uploadAvatar(file);
    profile.value = payload.user;
    user.value = payload.user;
    await nextTick();
    bioDraft.value = currentDraft;
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : "头像上传失败";
  } finally {
    avatarUploading.value = false;
    input.value = "";
  }
}
</script>
