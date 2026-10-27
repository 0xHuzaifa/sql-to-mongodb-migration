declare module "aws-sdk" {
  interface S3Instance {
    upload(params: { Bucket: string; Key: string; Body: Buffer; ContentType?: string }): { promise(): Promise<{ Location: string }> };
    deleteObject(params: { Bucket: string; Key: string }): { promise(): Promise<void> };
  }
  const AWS: {
    S3: new (options?: { accessKeyId?: string; secretAccessKey?: string; region?: string }) => S3Instance;
  };
  export = AWS;
}
