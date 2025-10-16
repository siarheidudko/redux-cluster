import * as fs from "fs";
import { BackupSettings, ReduxClusterStore, MessageType } from "../types/index.js";
import { encrypter, decrypter } from "../utils/crypto.js";

export class BackupManager<S = any> {
  private createBackupInstance?: BackupInstance<S>;

  constructor(
    private store: ReduxClusterStore<S>,
    private settings: BackupSettings
  ) {}

  public async initialize(): Promise<boolean> {
    try {
      await this.loadBackup();
      this.createBackupInstance = new BackupInstance(this.store, this.settings);
      return true;
    } catch (err: any) {
      if (err.message.toLowerCase().includes("no such file or directory")) {
        this.createBackupInstance = new BackupInstance(
          this.store,
          this.settings
        );
        return true;
      }
      throw err;
    }
  }

  private async loadBackup(): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.readFile(this.settings.path, (err, data) => {
        if (err) {
          reject(new Error(`ReduxCluster.backup load error: ${err.message}`));
          return;
        }

        try {
          let content = data.toString();

          // Decrypt if key is provided
          if (this.settings.key) {
            content = decrypter(content, this.settings.key);
          }

          const state = JSON.parse(content);

          // Restore state using internal method
          if (
            "_internalSync" in this.store &&
            typeof (this.store as any)._internalSync === "function"
          ) {
            (this.store as any)._internalSync(state);
          } else {
            // Fallback: use dispatchNEW if available, otherwise skip restore
            if (
              "dispatchNEW" in this.store &&
              typeof (this.store as any).dispatchNEW === "function"
            ) {
              (this.store as any).dispatchNEW({
                type: MessageType.SYNC,
                payload: state,
                _internal: true,
              });
            }
          }

          setTimeout(() => resolve(), 500);
        } catch (parseErr: any) {
          reject(
            new Error(`ReduxCluster.backup decoding error: ${parseErr.message}`)
          );
        }
      });
    });
  }
}

class BackupInstance<S = any> {
  private count = 0;
  private allowed = true;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private store: ReduxClusterStore<S>,
    private settings: BackupSettings
  ) {
    this.unsubscribe = this.store.subscribe(() => {
      this.handleStateChange();
    });
  }

  private handleStateChange(): void {
    if (typeof this.settings.timeout === "number") {
      // Priority setting - timeout based backup
      if (this.allowed) {
        this.allowed = false;
        setTimeout(() => {
          this.write(true);
        }, this.settings.timeout * 1000);
      }
    } else if (typeof this.settings.count === "number") {
      // Count based backup
      this.count++;
      if (this.count >= this.settings.count) {
        this.count = 0;
        this.write();
      }
    }
  }

  public write(restart = false, callback?: (success: boolean) => void): void {
    if (this.allowed || restart) {
      try {
        let content = JSON.stringify(this.store.getState());

        // Encrypt if key is provided
        if (this.settings.key) {
          content = encrypter(content, this.settings.key);
        }

        this.writeToFile(content, callback);
      } catch (err: any) {
        this.store.stderr(`ReduxCluster.backup write error: ${err.message}`);
        this.allowed = false;
        setTimeout(() => this.write(true, callback), 1000);
      }
    }
  }

  private writeToFile(
    content: string,
    callback?: (success: boolean) => void
  ): void {
    try {
      fs.writeFileSync(this.settings.path, content);
      this.allowed = true;
      if (callback) {
        callback(true);
      }
    } catch (err: any) {
      this.store.stderr(`ReduxCluster.backup write error: ${err.message}`);
      this.allowed = false;
      setTimeout(() => this.write(true, callback), 1000);
    }
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
