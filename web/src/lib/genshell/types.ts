/** A generated shell as the OS knows it. The HTML is fetched separately (it can be ~40 KB). */
export type ShellInfo = {
  label: string;
  name: string;
  exe: string;
  sha256: string;
  bytes: number;
  model: string;
  createdAt: number;
  installedBy: string;
  /** Set once the smoke test passed in a browser and the shell was published. */
  published: boolean;
  /** Walrus blob holding the HTML (testnet). */
  blobId?: string;
  /** <label>.shells.suica.eth once minted on ENS (Sepolia). */
  ens?: string;
};

/** What goes in the shell's `suica.shell` ENS text record. Small: every byte is calldata. */
export type ShellPointer = { v: 1; name: string; blobId: string; sha256: string; bytes: number; by: string };
