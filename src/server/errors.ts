export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class UnsupportedFormatError extends HttpError {
  constructor(msg = "不支持的文件格式") { super(400, msg); }
}
export class ParseFailedError extends HttpError {
  constructor(msg: string) { super(422, `模型解析失败：${msg}`); }
}
export class RenderTimeoutError extends HttpError {
  constructor() { super(504, "渲染超时（120s）"); }
}
export class ServiceBusyError extends HttpError {
  constructor() { super(503, "渲染器繁忙，请稍后重试"); }
}
