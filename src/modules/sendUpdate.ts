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
} from "../helpers.js";

export const sendUpdate = async ({
  req,
  bucket,
  storageRootFolder,
  rollbackEmbeddedFileName,
  rollbackFileName,
}: {
  req: Request;
  bucket: any;
  storageRootFolder: string;
  rollbackEmbeddedFileName: string;
  rollbackFileName: string;
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

  const updatesKey = req.headers.get("x-expo-updates-key");
  if (!updatesKey || typeof updatesKey !== "string") {
    return Response.json(
      {
        error: "No x-expo-updates-key provided.",
      },
      {
        status: 400,
      }
    );
  }

  const currentUpdateId = req.headers.get("expo-current-update-id");

  // create prefix
  const bucketPrefix = `${storageRootFolder}/${updatesKey}-${platform}/${runtimeVersion}`;

  const [result] = await bucket.getFiles({
    prefix: bucketPrefix,
    autoPaginate: false,
  });

  if (result.length <= 0) {
    return await putNoUpdateAvailableInResponseAsync(protocolVersion);
  }

  // get latest update bundle
  const latestBundleString = getLatestBundleString(result);

  if (!latestBundleString) {
    return await putNoUpdateAvailableInResponseAsync(protocolVersion);
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

        const platformSpecificMetadata =
          latestMetadata.json.fileMetadata[platform];

        const launchAsset = bucket.file(
          `${updateBundlePrefix}/${platformSpecificMetadata.bundle}`
        ) as FirebaseFileFunctions;

        const manifest = {
          id: convertSHA256HashToUUID(latestMetadata.id),
          createdAt: latestMetadata.createdAt,
          runtimeVersion,
          assets: await Promise.all(
            platformSpecificMetadata.assets.map(
              (asset: { path: string; ext: string }) => {
                const assetFile = bucket.file(
                  `${updateBundlePrefix}/${asset.path}`
                ) as FirebaseFileFunctions;
                return getAssetAsync({
                  assetFile,
                  ext: asset.ext,
                });
              }
            )
          ),
          launchAsset: await getAssetAsync({
            assetFile: launchAsset,
          }),
          metadata: {},
          extra: {
            expoClient: expoConfigJson,
          },
        };

        const assetRequestHeaders: { [key: string]: object } = {};
        [...manifest.assets, manifest.launchAsset].forEach((asset) => {
          assetRequestHeaders[asset.key] = {};
        });

        const form = new FormData();
        form.append("manifest", JSON.stringify(manifest), {
          contentType: "application/json",
          header: {
            "content-type": "application/json; charset=utf-8",
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

        const form = new FormData();
        form.append("directive", JSON.stringify(directive), {
          contentType: "application/json",
          header: {
            "content-type": "application/json; charset=utf-8",
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
        return await putNoUpdateAvailableInResponseAsync(protocolVersion);
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
