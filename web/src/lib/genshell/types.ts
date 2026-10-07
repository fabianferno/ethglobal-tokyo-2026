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
  /** Set once the smoke test passed in a browser and the shell was installed. */
  published: boolean;
};
