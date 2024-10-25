import crypto, { BinaryToTextEncoding } from "crypto";
import mime from "mime";
import fs from "fs/promises";
import path from "path";
import { Dictionary, serializeDictionary } from "structured-headers";

interface FirebaseFile {
  name: string;
}

export class NoUpdateAvailableError extends Error {}
export class NoPreviousUpdateError extends Error {}
export class UnauthorizedError extends Error {}

export interface FirebaseFileFunctions {
  download: () => Promise<Buffer[]>;
  getSignedUrl: (options: {
    action: string;
    expires: number;
  }) => Promise<string[]>;
}

export const getLatestBundleString = (files: FirebaseFile[]) => {
  const bundles = files
    .map((file) => {
      const name = file.name.split("/");
      const timestamp = name[3];
      return timestamp;
    })
    .filter((file) => file)
    // remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);
  const latestBundle = bundles.sort(
    (a, b) => parseInt(b, 10) - parseInt(a, 10)
  )[0];

  return latestBundle;
};

export const getLatestBundleVersionNumber = (files: FirebaseFile[]) => {
  const bundles = files
    .map((file) => {
      const name = file.name.split("/");
      const timestamp = name[3];
      return timestamp;
    })
    .filter((file) => file)
    // remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);
  return bundles.length;
};

export const getListOfBundles = (files: FirebaseFile[]) => {
  const bundles = files
    .map((file) => {
      const name = file.name.split("/");
      const timestamp = name[3];
      return timestamp;
    })
    .filter((file) => file)
    // remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);

  // sort in descending order
  return bundles.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
};

export const getFilesArrayString = (files: FirebaseFile[], prefix: string) => {
  const filteredFiles = files
    .filter((file) => file.name.startsWith(`${prefix}`))
    .filter((file) => !file.name.endsWith("/"))
    .map((file) => file.name.split(`${prefix}/`).pop() as string);

  return filteredFiles;
};

export enum UpdateType {
  NORMAL_UPDATE,
  ROLLBACK,
  ROLLBACK_EMBEDDED,
}

export const getTypeOfUpdate = (
  files: string[],
  fileNames: {
    rollbackEmbeddedFileName: string;
    rollbackFileName: string;
  }
) => {
  if (files.length > 0) {
    if (files.includes(fileNames.rollbackEmbeddedFileName)) {
      return UpdateType.ROLLBACK_EMBEDDED;
    } else if (files.includes(fileNames.rollbackFileName)) {
      return UpdateType.ROLLBACK;
    } else {
      return UpdateType.NORMAL_UPDATE;
    }
  } else {
    return undefined;
  }
};

export const getMetadataAsync = ({
  buffer,
  createdAt,
}: {
  buffer: Buffer;
  createdAt: string;
}) => {
  try {
    const json = JSON.parse(buffer.toString("utf-8"));
    return {
      json,
      createdAt: createdAt,
      id: createHash(buffer, "sha256", "hex"),
    };
  } catch (error) {
    throw new Error(`Error on Parsing Metadata Buffer. Error: ${error}`);
  }
};

export const createHash = (
  file: Buffer,
  hashingAlgorithm: string,
  encoding: BinaryToTextEncoding
) => {
  return crypto
    .createHash(hashingAlgorithm)
    .update(new Uint8Array(file))
    .digest(encoding);
};

export const convertSHA256HashToUUID = (value: string) => {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16
  )}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
};

export const getAssetAsync = async ({
  assetFile,
  ext,
}: {
  assetFile: FirebaseFileFunctions;
  ext?: string;
}) => {
  const [url] = await assetFile.getSignedUrl({
    action: "read",
    expires: Date.now() + 15 * 60 * 1000,
  });
  const keyExtensionSuffix = ext ? ext : "bundle";
  const contentType = ext ? mime.getType(ext) : "application/javascript";

  return {
    fileExtension: `.${keyExtensionSuffix}`,
    contentType,
    url,
  };
};

export const getBase64URLEncoding = (base64EncodedString: string) => {
  return base64EncodedString
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const generateToken = (length: number = 16) => {
  return crypto.randomBytes(length).toString("hex");
};

export const getPrivateKeyAsync = async ({
  bucket,
  storageRootFolder,
  updatesKey,
  privateKeysFolder,
  privateKeySuffix,
  projectName,
}: {
  bucket: any;
  storageRootFolder: string;
  updatesKey: string;
  privateKeysFolder: string;
  privateKeySuffix: string;
  projectName?: string;
}) => {
  try {
    const bucketPrefix = `${storageRootFolder}/${privateKeysFolder}`;
    let privateKeyFile: string;
    if (projectName) {
      // validate if projectName don't have white spaces or special characters
      if (!/^[a-zA-Z0-9-]*$/.test(projectName as string)) {
        return null;
      }
      privateKeyFile = `${projectName}-${updatesKey}${privateKeySuffix}`;
    } else {
      privateKeyFile = `${updatesKey}${privateKeySuffix}`;
    }

    const privateKey = bucket.file(`${bucketPrefix}/${privateKeyFile}`);
    const [privateKeyDownload] = await privateKey.download();
    return privateKeyDownload.toString();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const signRSASHA256 = (data: string, privateKey: string) => {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data, "utf8");
  sign.end();
  return sign.sign(privateKey, "base64");
};

export const convertToDictionaryItemsRepresentation = (obj: {
  [key: string]: string;
}): Dictionary => {
  return new Map(
    Object.entries(obj).map(([k, v]) => {
      return [k, [v, new Map()]];
    })
  );
};

export const generateSignature = ({
  valueString,
  privateKey,
  keyId,
}: {
  valueString: string;
  privateKey: string;
  keyId?: string;
}) => {
  const hashSignature = signRSASHA256(valueString, privateKey);
  const dictionary = convertToDictionaryItemsRepresentation({
    sig: hashSignature,
    keyid: keyId ?? "main",
  });
  return serializeDictionary(dictionary);
};

export const generateAuthKeyPairs = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return {
    privateKey,
    publicKey,
  };
};

export const authenticate = async ({
  req,
  bucket,
  storageRootFolder,
  authFileName,
  privateKeyFileName,
}: {
  req: Request;
  bucket: any;
  storageRootFolder: string;
  authFileName: string;
  privateKeyFileName: string;
}) => {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new UnauthorizedError();

  // typeOrText is either "Bearer" or the encrypted text
  const [typeOrText, token] = authorization.split(" ");
  if (!typeOrText) throw new UnauthorizedError();
  if (typeOrText === "Bearer" && !token) throw new UnauthorizedError();

  // TODO: validate the decrypted object
  // let decryptedObj: {
  //   buildTimestamp: number;
  //   platform: 'ios' | 'android';
  //   runtimeVersion: string;
  // } | null = null;
  if (typeOrText === "Bearer") {
    const authFile = bucket.file(`${storageRootFolder}/${authFileName}`);
    const [authFileDownload] = await authFile.download();
    const authFileContent: string = authFileDownload.toString();
    if (authFileContent !== token) throw new UnauthorizedError();
  } else {
    // if not a bearer token, its a encrypted token
    // validate using the private key

    // get the private key
    const bucketPrefix = `${storageRootFolder}`;
    const privateKeyFile = bucket.file(`${bucketPrefix}/${privateKeyFileName}`);
    const [privateKeyFileDownload] = await privateKeyFile.download();
    const privateKey = privateKeyFileDownload.toString();

    // validate and decrypt text
    try {
      const result = crypto
        .privateDecrypt(
          privateKey,
          new Uint8Array(Buffer.from(typeOrText, "base64"))
        )
        .toString("utf-8");
      console.log("Auth Info: ", JSON.parse(result));
      // TODO: validate the decrypted object
      // decryptedObj = JSON.parse(result);
    } catch (error) {
      console.error(error);
      throw new UnauthorizedError();
    }
  }
};
