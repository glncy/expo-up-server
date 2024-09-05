import FormData from "form-data";
import { generateSignature } from "./helpers.js";

export const putNoUpdateAvailableInResponseAsync = async (
  protocolVersion: number,
  privateKey: string | null
): Promise<Response> => {
  if (protocolVersion === 0) {
    throw new Error(
      "NoUpdateAvailable directive not available in protocol version 0"
    );
  }

  const directive = {
    type: "noUpdateAvailable",
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
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
      "cache-control": "private, max-age=0",
      "content-type": `multipart/mixed; boundary=${form.getBoundary()}`,
    },
  });
  return response;
};
