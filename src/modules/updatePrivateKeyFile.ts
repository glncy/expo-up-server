import { authenticate, UnauthorizedError } from "../helpers.js";

export const updatePrivateKeyFile = async ({
  req,
  bucket,
  storageRootFolder,
  privateKeyFileName,
  authFileName,
}: {
  req: Request;
  bucket: any;
  storageRootFolder: string;
  privateKeyFileName: string;
  authFileName: string;
}) => {
  try {
    await authenticate({
      req,
      bucket,
      storageRootFolder,
      authFileName,
      privateKeyFileName,
    });

    const body = await req.json();
    const { key, updatesKey, projectName, overwrite } = body;
    if (!key || !updatesKey || !projectName) {
      return Response.json(
        {
          error: "Missing required fields.",
        },
        {
          status: 400,
        }
      );
    }

    const bucketPrefix = `${storageRootFolder}/PROJECT_KEYS`;
    let projectKeyFile: string;
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
      projectKeyFile = `${projectName}-${updatesKey}-private-key.pem`;
    } else {
      projectKeyFile = `${updatesKey}-private-key.pem`;
    }

    const file = bucket.file(`${bucketPrefix}/${projectKeyFile}`);

    // validate if the file exists
    const [fileExists] = await file.exists();
    if (fileExists && !overwrite) {
      return Response.json(
        {
          error: "Private key file already exists. Use overwrite flag to update the file.",
        },
        {
          status: 404,
        }
      );
    }

    await file.save(key, {
      contentType: "text/plain",
    });
    
    return Response.json(
      {
        message: "Private key file updated successfully.",
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        {
          error: "Unauthorized authentication. Please check and provide a valid authentication.",
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
