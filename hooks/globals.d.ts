// The runtime has the ES2025 base64 methods; the engine's tsconfig lib (es2023) does not declare them.
interface Uint8Array {
  toBase64(): string
}
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}
