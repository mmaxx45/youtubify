// Followed artists (YouTube subscriptions), learned from artist pages and updated on follow/unfollow.

import { reactive } from "vue";
import { followArtist } from "../ytm/client";
import { refreshLibrary } from "./library";
import { toast } from "./toast";

const status = reactive(new Map<string, boolean>());

export const seedFollow = (channelId: string, following: boolean) => status.set(channelId, following);
export const isFollowing = (channelId: string) => status.get(channelId) ?? false;

export async function setFollowing(channelId: string, follow: boolean) {
  const before = status.get(channelId);
  status.set(channelId, follow);
  try {
    await followArtist(channelId, follow);
    toast(follow ? "Followed" : "Unfollowed");
    refreshLibrary();
  } catch {
    if (before === undefined) status.delete(channelId);
    else status.set(channelId, before);
    toast("Couldn't update follow");
  }
}
