declare module 'asterisk-manager' {
  interface AmiOptions {
    port?: number;
    host?: string;
    username?: string;
    password?: string;
    events?: boolean;
  }

  interface AmiAction {
    action: string;
    [key: string]: any;
  }

  interface AmiEvent {
    event: string;
    [key: string]: any;
  }

  interface AmiConnection {
    on(event: 'connect', listener: () => void): this;
    on(event: 'disconnect', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: string, listener: (data: any) => void): this;
    action(action: AmiAction, callback?: (error: any, response: any) => void): void;
  }

  function ami(port: number, host: string, username: string, password: string, events?: boolean): AmiConnection;

  export = ami;
}