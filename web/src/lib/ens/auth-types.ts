export type SignedAction = { app: "suica-os"; action: "mint" | "share" | "claim" | "revoke"; ens: string; ts: number };
