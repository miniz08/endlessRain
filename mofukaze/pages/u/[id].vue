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
            <FollowButton :user-id="profile.id" :following="summary?.followedByMe" @changed="loadSummary" />
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

      <aside class="panel">
        <h3>关系概览</h3>
        <p class="muted">关注关系会参与关注时间线，关注作者事件会进入推荐画像的作者亲和度。</p>
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

type ListType = "followers" | "following";

const route = useRoute();
const userId = computed(() => Number(route.params.id));
const { blogApi, userApi } = useApi();
const { refreshMe } = useAuth();
const profile = ref<PublicUser | null>(null);
const summary = ref<Summary | null>(null);
const relationItems = ref<RelationItem[]>([]);
const activeList = ref<ListType>("followers");

onMounted(async () => {
  await refreshMe();
  await Promise.all([loadProfile(), loadSummary(), loadRelations()]);
});

watch(userId, async () => {
  await Promise.all([loadProfile(), loadSummary(), loadRelations()]);
});

async function loadProfile() {
  const payload = await userApi<{ user: PublicUser }>(`/users/${userId.value}`);
  profile.value = payload.user;
}

async function loadSummary() {
  const payload = await blogApi<{ summary: Summary }>(`/users/${userId.value}/follow-summary`);
  summary.value = payload.summary;
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
</script>
