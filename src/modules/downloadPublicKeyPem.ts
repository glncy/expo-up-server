import { generateAuthKeyPairs, getFilesArrayString } from "../helpers.js";

export const downloadPublicKeyPem = async ({
  bucket,
  publicKeyFileName,
  privateKeyFileName,
  storageRootFolder,
}: {
  bucket: any;
  publicKeyFileName: string;
  privateKeyFileName: string;
  storageRootFolder: string;
}) => {
  const bucketPrefix = `${storageRootFolder}`;
  const [result] = await bucket.getFiles({
    prefix: bucketPrefix,
  });
  const filesStringArray = getFilesArrayString(result, `${bucketPrefix}`);
  const hasPublicKeyFile = filesStringArray.includes(publicKeyFileName);
  if (hasPublicKeyFile) {
    return Response.json(
      {
        message:
          "Key Pair already been generated. Please contact storage administrator to get the public key.",
      },
      {
        status: 403,
      }
    );
  } else {
    const keyPairs = generateAuthKeyPairs();
    const publicKeyFile = bucket.file(`${bucketPrefix}/${publicKeyFileName}`);
    const privateKeyFile = bucket.file(`${bucketPrefix}/${privateKeyFileName}`);
    await Promise.all([
      publicKeyFile.save(keyPairs.publicKey, {
        contentType: "text/plain",
      }),
      privateKeyFile.save(keyPairs.privateKey, {
        contentType: "text/plain",
      }),
    ]);

    const headers = new Headers();
    headers.set("Content-Type", "text/plain");
    headers.set("Content-Disposition", `attachment; filename=${publicKeyFileName}`);
    return new Response(keyPairs.publicKey, {
      status: 200,
      headers,
    });
  }
};
