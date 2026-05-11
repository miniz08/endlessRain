import type { PublicUser, UploadedMedia } from "~/types/social";

type UploadKind = "article" | "chat" | "sticker";

const SMALL_IMAGE_MAX_BYTES = 100 * 1024;
const REGULAR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function useMediaUpload() {
  const { userApi } = useApi();

  async function uploadImage(file: File, kind: UploadKind) {
    assertImageFile(file, kind === "sticker" ? SMALL_IMAGE_MAX_BYTES : REGULAR_IMAGE_MAX_BYTES);
    const body = new FormData();
    body.append("image", file);
    const query = new URLSearchParams({ kind });
    return userApi<{ media: UploadedMedia }>(`/users/media/images?${query.toString()}`, {
      method: "POST",
      body,
    });
  }

  async function uploadAvatar(file: File) {
    assertImageFile(file, SMALL_IMAGE_MAX_BYTES);
    const body = new FormData();
    body.append("image", file);
    return userApi<{ media: UploadedMedia; user: PublicUser }>("/users/me/avatar", {
      method: "POST",
      body,
    });
  }

  return {
    uploadImage,
    uploadAvatar,
    regularImageMaxBytes: REGULAR_IMAGE_MAX_BYTES,
    smallImageMaxBytes: SMALL_IMAGE_MAX_BYTES,
  };
}

function assertImageFile(file: File, maxBytes: number) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.size > maxBytes) {
    throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024)}KB`);
  }
}
