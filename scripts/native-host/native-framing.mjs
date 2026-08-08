const MAX_NATIVE_HOST_MESSAGE_BYTES = 1024 * 1024
export const MAX_NATIVE_EXTENSION_MESSAGE_BYTES = 64 * 1024 * 1024

export const encodeNativeMessage = (
  message,
  maximumBytes = MAX_NATIVE_HOST_MESSAGE_BYTES
) => {
  const payload = Buffer.from(JSON.stringify(message), "utf8")
  if (payload.length > maximumBytes) {
    throw new Error("native-message-too-large")
  }
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  return Buffer.concat([header, payload])
}

export const createNativeMessageDecoder = ({
  maximumBytes = MAX_NATIVE_EXTENSION_MESSAGE_BYTES,
  onMessage
}) => {
  let pending = Buffer.alloc(0)

  return (chunk) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 4) {
      const payloadLength = pending.readUInt32LE(0)
      if (payloadLength > maximumBytes) {
        throw new Error("native-message-too-large")
      }
      if (pending.length < payloadLength + 4) return
      const payload = pending.subarray(4, payloadLength + 4)
      pending = pending.subarray(payloadLength + 4)
      onMessage(JSON.parse(payload.toString("utf8")))
    }
  }
}
