import FormData from "form-data";

import { putNoUpdateAvailableInResponseAsync } from "../responses.js";
import {
  getFilesArrayString,
  getLatestBundleString,
  getMetadataAsync,
  NoUpdateAvailableError,
  getTypeOfUpdate as initialGetTypeOfUpdate,
  UpdateType,
  convertSHA256HashToUUID,
  getAssetAsync,
  FirebaseFileFunctions,
  getLatestBundleVersionNumber,
  getPrivateKeyAsync,
  generateSignature,
} from "../helpers.js";

export const sendUpdate = async ({
  req,
  bucket,
  storageRootFolder,
  rollbackEmbeddedFileName,
  rollbackFileName,
  privateKeysFolder,
  privateKeySuffix,
}: {
  req: Request;
  bucket: any;
  storageRootFolder: string;
  rollbackEmbeddedFileName: string;
  rollbackFileName: string;
  privateKeysFolder: string;
  privateKeySuffix: string;
}) => {
  const getTypeOfUpdate = (files: string[]) => {
    return initialGetTypeOfUpdate(files, {
      rollbackEmbeddedFileName,
      rollbackFileName,
    });
  };
  const url = new URL(req.url);

  const protocolVersionMaybeArray = req.headers.get("expo-protocol-version");
  if (protocolVersionMaybeArray && Array.isArray(protocolVersionMaybeArray)) {
    return Response.json(
      {
        error: "Unsupported protocol version. Expected either 0 or 1.",
      },
      {
        status: 400,
      }
    );
  }
  const protocolVersion = parseInt(protocolVersionMaybeArray ?? "0", 10);

  const platform =
    req.headers.get("expo-platform") ?? url.searchParams.get("platform");
  if (platform !== "ios" && platform !== "android") {
    return Response.json(
      {
        error: "Unsupported platform. Expected either ios or android.",
      },
      {
        status: 400,
      }
    );
  }

  const runtimeVersion =
    req.headers.get("expo-runtime-version") ??
    url.searchParams.get("runtime-version");
  if (!runtimeVersion || typeof runtimeVersion !== "string") {
    return Response.json(
      {
        error: "No runtimeVersion provided.",
      },
      {
        status: 400,
      }
    );
  }

  let updatesKey: string | null = null;
  if (req.headers.get("x-expo-up-key")) {
    updatesKey = req.headers.get("x-expo-up-key");
  } else {
    // log deprecated warning
    console.warn(
      "The x-expo-updates-key header is deprecated. It will be removed in a future release. Please use x-expo-up-key instead."
    );
    updatesKey = req.headers.get("x-expo-updates-key");
  }

  let projectName: string | null = null;
  if (req.headers.get("x-expo-up-name")) {
    projectName = req.headers.get("x-expo-up-name");
  } else {
    // log x-expo-up-name will be required in the future
    console.warn("x-expo-up-name header will be required in the future.");
  }

  if (!updatesKey || typeof updatesKey !== "string") {
    return Response.json(
      {
        error: "No x-expo-up-key provided.",
      },
      {
        status: 400,
      }
    );
  }

  const currentUpdateId = req.headers.get("expo-current-update-id");

  // create prefix
  let bucketPrefix: string;
  if (projectName) {
    // validate if projectName don't have white spaces or special characters
    if (!/^[a-zA-Z0-9-]*$/.test(projectName as string)) {
      return Response.json(
        {
          error: "Invalid project name.",
        },
        {
          status: 400,
        }
      );
    }
    bucketPrefix = `${storageRootFolder}/${projectName}-${updatesKey}-${platform}/${runtimeVersion}`;
  } else {
    bucketPrefix = `${storageRootFolder}/${updatesKey}-${platform}/${runtimeVersion}`;
  }

  // signature validation
  let privateKey: string | null = null;
  const expectSignatureHeader = req.headers.get("expo-expect-signature");

  if (expectSignatureHeader) {
    privateKey = await getPrivateKeyAsync({
      bucket,
      storageRootFolder,
      updatesKey,
      privateKeysFolder,
      privateKeySuffix,
      ...(projectName ? { projectName } : {}),
    });
    if (!privateKey) {
      console.error(
        "Code signing requested but no key supplied when starting server."
      );
      return Response.json(
        {
          error:
            "Code signing requested but no key supplied when starting server.",
        },
        { status: 500 }
      );
    }
  }

  const [result] = await bucket.getFiles({
    prefix: bucketPrefix,
    autoPaginate: false,
  });

  if (result.length <= 0) {
    return await putNoUpdateAvailableInResponseAsync(
      protocolVersion,
      privateKey
    );
  }

  // get latest update bundle
  const latestBundleString = getLatestBundleString(result);

  if (!latestBundleString) {
    return await putNoUpdateAvailableInResponseAsync(
      protocolVersion,
      privateKey
    );
  }

  const latestBundlePrefix = `${bucketPrefix}/${latestBundleString}`;
  const filesStringArray = getFilesArrayString(result, `${latestBundlePrefix}`);
  const updateType = getTypeOfUpdate(filesStringArray);

  try {
    try {
      if (
        updateType === UpdateType.NORMAL_UPDATE ||
        updateType === UpdateType.ROLLBACK
      ) {
        let updateBundlePrefix = latestBundlePrefix;
        if (updateType === UpdateType.ROLLBACK) {
          const rollbackFile = bucket.file(`${updateBundlePrefix}/rollback`);
          const [rollbackDownlaod] = await rollbackFile.download();
          const rollbackBundle = rollbackDownlaod.toString("utf-8");
          updateBundlePrefix = `${bucketPrefix}/${rollbackBundle}`;
        }
        const metadataJson = bucket.file(`${updateBundlePrefix}/metadata.json`);
        const [metadataJsonDownload] = await metadataJson.download();
        const [metadataJsonMetadata] = await metadataJson.getMetadata();

        const buffer = metadataJsonDownload;
        const latestMetadata = await getMetadataAsync({
          buffer,
          createdAt:
            metadataJsonMetadata.timeCreated ?? new Date().toISOString(),
        });

        if (
          currentUpdateId === convertSHA256HashToUUID(latestMetadata.id) &&
          protocolVersion === 1
        )
          throw new NoUpdateAvailableError();

        const expoConfigFile = bucket.file(
          `${updateBundlePrefix}/expoConfig.json`
        );
        const [expoConfigDownload] = await expoConfigFile.download();
        const expoConfigBuffer = expoConfigDownload;
        const expoConfigJson = JSON.parse(expoConfigBuffer.toString("utf-8"));

        const hashInfoFile = bucket.file(`${updateBundlePrefix}/hashInfo.json`);
        const [hashInfoDownload] = await hashInfoFile.download();
        const hashInfoBuffer = hashInfoDownload;
        const hashInfoJson = JSON.parse(hashInfoBuffer.toString("utf-8"));

        const platformSpecificMetadata =
          latestMetadata.json.fileMetadata[platform];

        const launchAsset = bucket.file(
          `${updateBundlePrefix}/${platformSpecificMetadata.bundle}`
        ) as FirebaseFileFunctions;

        const [bundleNumber, version] = latestBundleString.split("-v");

        const manifest = {
          id: convertSHA256HashToUUID(latestMetadata.id),
          createdAt: latestMetadata.createdAt,
          runtimeVersion,
          assets: await Promise.all(
            platformSpecificMetadata.assets.map(
              async (asset: { path: string; ext: string }) => {
                const assetFile = bucket.file(
                  `${updateBundlePrefix}/${asset.path}`
                ) as FirebaseFileFunctions;
                return {
                  ...hashInfoJson[asset.path],
                  ...(await getAssetAsync({
                    assetFile,
                    ext: asset.ext,
                  })),
                };
              }
            )
          ),
          launchAsset: {
            ...hashInfoJson[platformSpecificMetadata.bundle],
            ...(await getAssetAsync({
              assetFile: launchAsset,
            })),
          },
          metadata: {
            version: version
              ? parseInt(version, 10)
              : getLatestBundleVersionNumber(result),
            bundleNumber: parseInt(bundleNumber, 10),
            type: updateType === UpdateType.ROLLBACK ? "rollback" : "update",
          },
          extra: {
            expoClient: expoConfigJson,
          },
        };

        const assetRequestHeaders: { [key: string]: object } = {};
        [...manifest.assets, manifest.launchAsset].forEach((asset) => {
          assetRequestHeaders[asset.key] = {};
        });

        let signature: string | null = null;
        if (privateKey) {
          const valueString = JSON.stringify(manifest);
          signature = await generateSignature({
            valueString,
            privateKey,
          });
        }

        const form = new FormData();
        form.append("manifest", JSON.stringify(manifest), {
          contentType: "application/json",
          header: {
            "content-type": "application/json; charset=utf-8",
            ...(signature ? { "expo-signature": signature } : {}),
          },
        });
        form.append("extensions", JSON.stringify({ assetRequestHeaders }), {
          contentType: "application/json",
        });

        const response = new Response(form.getBuffer(), {
          status: 200,
          headers: {
            "expo-protocol-version": `${protocolVersion}`,
            "expo-sfv-version": "0",
            "cache-control": "private, max-age=0",
            "content-type": `multipart/mixed; boundary=${form.getBoundary()}`,
          },
        });
        return response;
      } else if (updateType === UpdateType.ROLLBACK_EMBEDDED) {
        if (protocolVersion === 0) {
          throw new Error("Rollbacks not supported on protocol version 0");
        }

        const embeddedUpdateId = req.headers.get("expo-embedded-update-id");
        if (!embeddedUpdateId || typeof embeddedUpdateId !== "string") {
          throw new Error(
            "Invalid Expo-Embedded-Update-ID request header specified."
          );
        }

        const currentUpdateId = req.headers.get("expo-current-update-id");
        if (currentUpdateId === embeddedUpdateId) {
          throw new NoUpdateAvailableError();
        }

        const rollbackFile = bucket.file(`${latestBundlePrefix}/rollback`);
        const [rollbackMetadata] = await rollbackFile.getMetadata();

        const directive = {
          type: "rollBackToEmbedded",
          parameters: {
            commitTime: rollbackMetadata.timeCreated,
          },
        };

        let signature: string | null = null;
        if (privateKey) {
          const valueString = JSON.stringify(directive);
          signature = await generateSignature({
            valueString,
            privateKey,
          });
        }

        const form = new FormData();
        form.append("directive", JSON.stringify(directive), {
          contentType: "application/json",
          header: {
            "content-type": "application/json; charset=utf-8",
            ...(signature ? { "expo-signature": signature } : {}),
          },
        });

        const response = new Response(form.getBuffer(), {
          status: 200,
          headers: {
            "expo-protocol-version": `${protocolVersion}`,
            "expo-sfv-version": "0",
            "cache-control": "private, max-age=0",
            "content-type": `multipart/mixed; boundary=${form.getBoundary()}`,
          },
        });
        return response;
      } else {
        throw new Error("Invalid update type.");
      }
    } catch (maybeNoUpdateAvailableError) {
      if (maybeNoUpdateAvailableError instanceof NoUpdateAvailableError) {
        return await putNoUpdateAvailableInResponseAsync(
          protocolVersion,
          privateKey
        );
      }
      throw maybeNoUpdateAvailableError;
    }
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error,
      },
      {
        status: 404,
      }
    );
  }
};
