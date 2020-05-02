function readFileAsync(file: File) {
  return new Promise<string>((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      resolve(typeof result === "string" ? result : "");
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default readFileAsync;
