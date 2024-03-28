import { generateToken, getFilesArrayString } from "../helpers.js";

export const initializeAuthFile = async ({
  bucket,
  authFileName,
  storageRootFolder,
}: {
  bucket: any;
  authFileName: string;
  storageRootFolder: string;
}) => {
  const bucketPrefix = `${storageRootFolder}`;
  const [result] = await bucket.getFiles({
    prefix: bucketPrefix,
  });
  const filesStringArray = getFilesArrayString(result, `${bucketPrefix}`);
  const hasAuthFile = filesStringArray.includes(authFileName);
  if (hasAuthFile) {
    return Response.json(
      {
        error: `${authFileName} file has been generated. Please check storage server.`,
      },
      {
        status: 403,
      }
    );
  } else {
    // create a new auth token
    const authToken = generateToken();
    const file = bucket.file(`${bucketPrefix}/${authFileName}`);
    await file.save(authToken, {
      contentType: "text/plain",
    });
    return Response.json(
      {
        message: "Auth Token generated successfully.",
        authToken: authToken,
      },
      {
        status: 200,
      }
    );
  }
};
