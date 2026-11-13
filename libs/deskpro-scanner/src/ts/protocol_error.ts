/** A frame the peer sent that we cannot parse. Always fatal to the connection. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}
