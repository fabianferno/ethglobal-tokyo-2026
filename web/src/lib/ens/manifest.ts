import type { IconName } from "@/components/win99/Icon";
import type { AppManifest } from "@/lib/compose/compose";
import type { Params } from "@/lib/intent/parse";
import type { ConcreteShell, FnKey, SceneKey, Vibe } from "@/lib/intent/types";

/** What goes in the `suica.manifest` text record. Everything needed to rebuild the UI, nothing else. */
export type StoredManifest = {
  v: 1;
  title: string;
  icon: string;
  shell: string;
  fn: string;
  vibe: string;
  scene: string;
  prompt: string;
  params: unknown;
  readOnly: boolean;
  target: string;
  owner: string;
  description: string;
};

export function toStored(m: AppManifest): StoredManifest {
  return {
    v: 1,
    title: m.title,
    icon: m.icon,
    shell: m.shell,
    fn: m.fn,
    vibe: m.vibe,
    scene: m.scene,
    prompt: m.prompt,
    params: m.params,
    readOnly: m.readOnly,
    target: m.target,
    owner: m.owner,
    description: m.description,
  };
}

/** Rebuild an app from its ENS records — this is how a shared/published app opens on another machine. */
export function fromStored(ens: string, s: StoredManifest, published: boolean): AppManifest {
  return {
    id: `ens:${ens}`,
    ens,
    title: s.title,
    icon: s.icon as IconName,
    shell: s.shell as ConcreteShell,
    fn: s.fn as FnKey,
    vibe: s.vibe as Vibe,
    scene: s.scene as SceneKey,
    prompt: s.prompt,
    params: s.params as Params,
    readOnly: s.readOnly,
    target: s.target,
    owner: s.owner,
    published,
    description: s.description,
  };
}
