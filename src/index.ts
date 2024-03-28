import { uploadAndRollback as initUploadAndRollback } from "./modules/uploadAndRollback.js";
import { sendUpdate as initSendUpdate } from "./modules/sendUpdate.js";
import { initializeAuthFile as initInitializeAuthFile } from "./modules/initializeAuthFile.js";

import {
  defaultAuthFileName,
  defaultRollbackEmbeddedFileName,
  defaultRollbackFileName,
  defaultStorageRootFolder,
} from "./constants.js";

export const ExpoUp = ({
  bucket,
  rollbackEmbeddedFileName = defaultRollbackEmbeddedFileName,
  rollbackFileName = defaultRollbackFileName,
  storageRootFolder = defaultStorageRootFolder,
  authFileName = defaultAuthFileName,
}: {
  bucket: any;
  rollbackEmbeddedFileName?: string;
  rollbackFileName?: string;
  storageRootFolder?: string;
  authFileName?: string;
}) => {
  return {
    uploadAndRollback: (req: Request) =>
      initUploadAndRollback({
        req,
        bucket,
        storageRootFolder,
        rollbackEmbeddedFileName,
        rollbackFileName,
        authFileName,
      }),
    sendUpdate: (req: Request) =>
      initSendUpdate({
        req,
        bucket,
        storageRootFolder,
        rollbackEmbeddedFileName,
        rollbackFileName,
      }),
    initializeAuthFile: () =>
      initInitializeAuthFile({
        bucket,
        authFileName,
        storageRootFolder,
      }),
  };
};
