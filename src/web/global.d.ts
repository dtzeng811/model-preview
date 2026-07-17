// TS 7 下 @fontsource-variable/* 包的 package.json exports 只映射到 .css 文件，
// 不含 "types" 条件；vite/client.d.ts 的 `declare module '*.css'` 通配只匹配以
// .css 结尾的字面量说明符，不匹配这种解析后才是 .css 的裸包名，
// 因此侧效导入会报 TS2882（找不到模块声明）。这里补充最小 ambient 声明。
declare module "@fontsource-variable/plus-jakarta-sans";
declare module "@fontsource-variable/manrope";
