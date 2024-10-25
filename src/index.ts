import { uploadAndRollback as initUploadAndRollback } from "./modules/uploadAndRollback.js";
import { sendUpdate as initSendUpdate } from "./modules/sendUpdate.js";
import { initializeAuthFile as initInitializeAuthFile } from "./modules/initializeAuthFile.js";
import { updatePrivateKeyFile as initUpdatePrivateKeyFile } from "./modules/updatePrivateKeyFile.js";
import { downloadPublicKeyPem as initDownloadPublicKeyPem } from "./modules/downloadPublicKeyPem.js";

import {
  defaultAuthFileName,
  defaultPrivateKeyFileName,
  defaultPublicKeyFileName,
  defaultRollbackEmbeddedFileName,
  defaultRollbackFileName,
  defaultStorageRootFolder,
  defaultPrivateKeysFolder,
  defaultPrivateKeySuffix,
} from "./constants.js";

interface ExpoUpReturn {
  /**
   * This method will help you to upload a new bundle and rollback bundle to the storage server.
   */
  uploadAndRollback: (req: Request) => void;
  /**
   * This method will help you to send manifest update to the storage server.
   */
  sendUpdate: (req: Request) => void;
  /**
   * @deprecated Use `downloadPublicKeyPem` instead.
   */
  initializeAuthFile: () => void;
  /**
   * This method will help you to download the public key pem file from the storage server.
   */
  downloadPublicKeyPem: () => void;
  /**
   * This method will help you to update the private key file for code signing.
   */
  updatePrivateKeyFile: (req: Request) => void;
}

type ExpoUpProps = {
  bucket: any;
  rollbackEmbeddedFileName?: string;
  rollbackFileName?: string;
  storageRootFolder?: string;
  authFileName?: string;
  publicKeyFileName?: string;
  privateKeyFileName?: string;
  privateKeysFolder?: string;
  privateKeySuffix?: string;
};

type ExpoUpType = (options: ExpoUpProps) => ExpoUpReturn;

export const ExpoUp: ExpoUpType = ({
  bucket,
  rollbackEmbeddedFileName = defaultRollbackEmbeddedFileName,
  rollbackFileName = defaultRollbackFileName,
  storageRootFolder = defaultStorageRootFolder,
  authFileName = defaultAuthFileName,
  publicKeyFileName = defaultPublicKeyFileName,
  privateKeyFileName = defaultPrivateKeyFileName,
  privateKeysFolder = defaultPrivateKeysFolder,
  privateKeySuffix = defaultPrivateKeySuffix,
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
        privateKeyFileName,
      }),
    sendUpdate: (req: Request) =>
      initSendUpdate({
        req,
        bucket,
        storageRootFolder,
        rollbackEmbeddedFileName,
        rollbackFileName,
        privateKeysFolder,
        privateKeySuffix,
      }),
    initializeAuthFile: () =>
      initInitializeAuthFile({
        bucket,
        authFileName,
        storageRootFolder,
      }),
    downloadPublicKeyPem: () =>
      initDownloadPublicKeyPem({
        bucket,
        publicKeyFileName,
        privateKeyFileName,
        storageRootFolder,
      }),
    updatePrivateKeyFile: (req: Request) =>
      initUpdatePrivateKeyFile({
        req,
        bucket,
        storageRootFolder,
        privateKeyFileName,
        authFileName,
        privateKeysFolder,
        privateKeySuffix,
      }),
  };
};
