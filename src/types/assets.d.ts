declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

// Vite serves the file as a same-origin asset and gives back its URL.
declare module '*.wasm?url' {
  const url: string;
  export default url;
}