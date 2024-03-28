import {
  NoPreviousUpdateError,
  UpdateType,
  getListOfBundles,
  getFilesArrayString,
  getLatestBundleString,
  getTypeOfUpdate as initialGetTypeOfUpdate,
  getMetadataAsync,
  UnauthorizedError,
} from "../helpers.js";
import JSZip from "jszip";

export const uploadAndRollback = async ({
  req,
  bucket,
  storageRootFolder,
  rollbackEmbeddedFileName,
  rollbackFileName,
  authFileName,
}: {
  req: Request;
  bucket: any;
  storageRootFolder: string;
  rollbackEmbeddedFileName: string;
  rollbackFileName: string;
  authFileName: string;
}) => {
  try {
    const getTypeOfUpdate = (files: string[]) => {
      return initialGetTypeOfUpdate(files, {
        rollbackEmbeddedFileName,
        rollbackFileName,
      });
    };

    const authorization = req.headers.get("authorization");
    if (!authorization) throw new UnauthorizedError();

    const [_bearer, token] = authorization.split(" ");
    if (!token) throw new UnauthorizedError();

    const authFile = bucket.file(`${storageRootFolder}/${authFileName}`);
    const [authFileDownload] = await authFile.download();
    const authFileContent: string = authFileDownload.toString();
    if (authFileContent !== token) throw new UnauthorizedError();

    const contentType = req.headers.get("content-type");
    if (contentType === "application/json") {
      try {
        const body = await req.json();
        const rollbackType: "embedded" | "previous" | undefined =
          body.rollbackType;
        const { updatesKey, platform, runtimeVersion } = body;

        if (!updatesKey || !platform || !runtimeVersion || !rollbackType) {
          return Response.json(
            {
              error: "Missing required fields.",
            },
            {
              status: 400,
            }
          );
        }

        if (rollbackType !== "embedded" && rollbackType !== "previous") {
          return Response.json(
            {
              error: "Invalid rollback type.",
            },
            {
              status: 400,
            }
          );
        }

        const timestamp = new Date().getTime();
        const bucketPrefix = `${storageRootFolder}/${updatesKey}-${platform}/${runtimeVersion}`;
        const [result] = await bucket.getFiles({
          prefix: bucketPrefix,
          autoPaginate: false,
        });
        const latestBundleString = getLatestBundleString(result);
        if (!latestBundleString) {
          throw new NoPreviousUpdateError();
        }

        if (rollbackType === "embedded") {
          const file = bucket.file(
            `${bucketPrefix}/${timestamp}/${rollbackEmbeddedFileName}`
          );
          await file.save(``, {
            contentType: "text/plain",
          });
          return Response.json(
            {
              message: "Rollback to embedded successful.",
            },
            {
              status: 201,
            }
          );
        } else {
          const filesStringArray = getFilesArrayString(
            result,
            `${bucketPrefix}/${latestBundleString}`
          );
          const updateType = getTypeOfUpdate(filesStringArray);
          if (updateType === UpdateType.NORMAL_UPDATE) {
            const bundles = getListOfBundles(result);
            const previousBundleIndex = bundles.indexOf(latestBundleString) + 1;
            if (bundles[previousBundleIndex]) {
              const file = bucket.file(
                `${bucketPrefix}/${timestamp}/${rollbackFileName}`
              );
              await file.save(`${bundles[previousBundleIndex]}`, {
                contentType: "text/plain",
              });
              return Response.json(
                {
                  message: "Rollback to previous update successful.",
                },
                {
                  status: 201,
                }
              );
            } else {
              const file = bucket.file(
                `${bucketPrefix}/${timestamp}/${rollbackEmbeddedFileName}`
              );
              await file.save(``, {
                contentType: "text/plain",
              });
              return Response.json(
                {
                  message: "Rollback to embedded update successful.",
                },
                {
                  status: 201,
                }
              );
            }
          } else if (updateType === UpdateType.ROLLBACK) {
            const bundles = getListOfBundles(result);
            const bundlePrefix = `${bucketPrefix}/${latestBundleString}`;
            const rollbackFile = bucket.file(
              `${bundlePrefix}/${rollbackFileName}`
            );
            const [rollbackFileDownload] = await rollbackFile.download();
            const rollbackTimestamp = rollbackFileDownload.toString();
            const previousBundleIndex = bundles.indexOf(rollbackTimestamp) + 1;
            if (bundles[previousBundleIndex]) {
              for (let i = previousBundleIndex; i < bundles.length; i++) {
                const prevFilesStringArray = getFilesArrayString(
                  result,
                  `${bucketPrefix}/${bundles[i]}`
                );
                const prevUpdateType = getTypeOfUpdate(prevFilesStringArray);
                if (prevUpdateType === UpdateType.NORMAL_UPDATE) {
                  const file = bucket.file(
                    `${bucketPrefix}/${timestamp}/${rollbackFileName}`
                  );
                  await file.save(`${bundles[i]}`, {
                    contentType: "text/plain",
                  });
                  return Response.json(
                    {
                      message: "Rollback to previous update successful.",
                    },
                    {
                      status: 201,
                    }
                  );
                }
              }
            } else {
              const file = bucket.file(
                `${bucketPrefix}/${timestamp}/${rollbackEmbeddedFileName}`
              );
              await file.save(``, {
                contentType: "text/plain",
              });
              return Response.json(
                {
                  message: "Rollback to embedded successful.",
                },
                {
                  status: 201,
                }
              );
            }
          } else if (updateType === UpdateType.ROLLBACK_EMBEDDED) {
            const bundles = getListOfBundles(result);
            const previousBundleIndex = bundles.indexOf(latestBundleString) + 1;
            if (bundles[previousBundleIndex]) {
              const prevFilesStringArray = getFilesArrayString(
                result,
                `${bucketPrefix}/${bundles[previousBundleIndex]}`
              );
              const prevUpdateType = getTypeOfUpdate(prevFilesStringArray);
              if (prevUpdateType === UpdateType.NORMAL_UPDATE) {
                if (!bundles[previousBundleIndex + 1]) {
                  throw new NoPreviousUpdateError();
                }
                const file = bucket.file(
                  `${bucketPrefix}/${timestamp}/${rollbackFileName}`
                );
                await file.save(`${bundles[previousBundleIndex]}`, {
                  contentType: "text/plain",
                });
                return Response.json(
                  {
                    message: "Rollback to previous update successful.",
                  },
                  {
                    status: 201,
                  }
                );
              } else if (prevUpdateType === UpdateType.ROLLBACK) {
                const prevRollbackFile = bucket.file(
                  `${bucketPrefix}/${bundles[previousBundleIndex]}/${rollbackFileName}`
                );
                const [prevRollbackFileDownload] =
                  await prevRollbackFile.download();
                const prevRollbackTimestamp =
                  prevRollbackFileDownload.toString();
                const prevPreviousBundleIndex =
                  bundles.indexOf(prevRollbackTimestamp) + 1;
                if (bundles[prevPreviousBundleIndex]) {
                  for (
                    let j = prevPreviousBundleIndex;
                    j < bundles.length;
                    j++
                  ) {
                    const prevPrevFilesStringArray = getFilesArrayString(
                      result,
                      `${bucketPrefix}/${bundles[j]}`
                    );
                    const prevPrevUpdateType = getTypeOfUpdate(
                      prevPrevFilesStringArray
                    );
                    if (prevPrevUpdateType === UpdateType.NORMAL_UPDATE) {
                      const file = bucket.file(
                        `${bucketPrefix}/${timestamp}/${rollbackFileName}`
                      );
                      await file.save(`${bundles[j]}`, {
                        contentType: "text/plain",
                      });
                      return Response.json(
                        {
                          message: "Rollback to previous update successful.",
                        },
                        {
                          status: 201,
                        }
                      );
                    }
                  }
                } else {
                  throw new NoPreviousUpdateError();
                }
              } else {
                throw new NoPreviousUpdateError();
              }
            } else {
              throw new NoPreviousUpdateError();
            }
          } else {
            throw Error("Invalid update type.");
          }
        }
      } catch (error) {
        if (error instanceof NoPreviousUpdateError) {
          return Response.json(
            {
              error: "No previous update available.",
            },
            {
              status: 404,
            }
          );
        }
        throw error;
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file");
      const updatesKey = formData.get("updatesKey");
      const platform = formData.get("platform");
      const runtimeVersion = formData.get("runtimeVersion");
      const bundleTimestamp = formData.get("bundleTimestamp");

      if (
        !file ||
        !updatesKey ||
        !platform ||
        !runtimeVersion ||
        !bundleTimestamp
      ) {
        return Response.json(
          {
            error: "Missing required fields.",
          },
          {
            status: 400,
          }
        );
      }

      const bucketPrefix = `${storageRootFolder}/${updatesKey}-${platform}/${runtimeVersion}`;
      const fileArrayBuffer =
        typeof file !== "string" ? await file.arrayBuffer() : null;

      if (!fileArrayBuffer) {
        return Response.json(
          {
            error: "Invalid file.",
          },
          {
            status: 400,
          }
        );
      }

      const jszip = new JSZip();
      const zip = await jszip.loadAsync(fileArrayBuffer);
      const zipFiles = Object.keys(zip.files)
        .filter((file) => {
          if (!zip.files[file].dir) {
            return true;
          }
          return false;
        })
        .map((file) => zip.files[file]);

      // get latest update bundle
      const [result] = await bucket.getFiles({
        prefix: bucketPrefix,
        autoPaginate: false,
      });

      if (result.length !== 0) {
        const latestBundleString = getLatestBundleString(result);
        const latestBundlePrefix = `${bucketPrefix}/${latestBundleString}`;
        const filesStringArray = getFilesArrayString(
          result,
          `${latestBundlePrefix}`
        );
        const updateType = getTypeOfUpdate(filesStringArray);

        if (updateType === UpdateType.NORMAL_UPDATE) {
          // download metadata file
          const metadataJson = bucket.file(
            `${latestBundlePrefix}/metadata.json`
          );
          const [metadataJsonDownload] = await metadataJson.download();
          const [metadataJsonMetadata] = await metadataJson.getMetadata();
          const buffer = metadataJsonDownload;
          const latestMetadata = await getMetadataAsync({
            buffer,
            createdAt:
              metadataJsonMetadata.timeCreated ?? new Date().toISOString(),
          });

          const zipNewMetadata = zipFiles.find((file) => {
            if (file.name === "metadata.json") {
              return true;
            }
            return false;
          });

          let newMetadata;
          if (zipNewMetadata) {
            const arrayBuffer = await zipNewMetadata.async("arraybuffer");
            // convert array buffer to buffer
            const newBuffer = Buffer.from(arrayBuffer);
            newMetadata = await getMetadataAsync({
              buffer: newBuffer,
              createdAt: new Date(zipNewMetadata.date).toISOString(),
            });
          }

          if (!newMetadata) {
            return Response.json(
              {
                error: "Invalid update bundle.",
              },
              {
                status: 400,
              }
            );
          }

          if (latestMetadata.id === newMetadata.id) {
            return Response.json(
              {
                message: "Update already exists.",
              },
              {
                status: 200,
              }
            );
          }
        }
      }

      // upload files
      for await (const unzippedFile of zipFiles) {
        const arrayBuffer = await unzippedFile.async("arraybuffer");
        const buffer = Buffer.from(arrayBuffer);
        const file = bucket.file(
          `${bucketPrefix}/${bundleTimestamp}/${unzippedFile.name}`
        );
        await file.save(buffer);
      }

      return Response.json(
        {
          message: "Update uploaded successfully.",
        },
        {
          status: 201,
        }
      );
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        {
          error: "Unauthorized token. Please check and provide a valid token.",
        },
        {
          status: 401,
        }
      );
    }
    console.error(error);
    return Response.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
};
