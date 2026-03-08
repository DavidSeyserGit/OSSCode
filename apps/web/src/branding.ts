export const APP_BASE_NAME = "OSS Code";
export const APP_STAGE_LABEL = import.meta.env.DEV ? "Dev" : "Alpha";
export const APP_DISPLAY_NAME = `${APP_BASE_NAME} (${APP_STAGE_LABEL})`;
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;
export const APP_DEV_VERSION_LABEL = import.meta.env.DEV ? `v${APP_VERSION}` : null;
