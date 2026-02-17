import axios, { AxiosHeaders } from "axios";
import type { AxiosError, AxiosInstance } from "axios";

import type { ApiError } from "../shared/api/types";
import type {
  IApiService,
  UpdateProfileInput,
} from "../domain/interfaces/IApiService";

import { ensureCsrf as ensureCsrfRequest } from "./apiService/ensureCsrf";
import { ensurePresenceSession } from "./apiService/ensurePresenceSession";
import { getSession } from "./apiService/getSession";
import { login } from "./apiService/login";
import { register } from "./apiService/register";
import { logout } from "./apiService/logout";
import { updateProfile } from "./apiService/updateProfile";
import { getPasswordRules } from "./apiService/getPasswordRules";
import { getPublicRoom } from "./apiService/getPublicRoom";
import { getRoomDetails } from "./apiService/getRoomDetails";
import { getRoomMessages } from "./apiService/getRoomMessages";
import { getUserProfile } from "./apiService/getUserProfile";
import { startDirectChat } from "./apiService/startDirectChat";
import { getDirectChats } from "./apiService/getDirectChats";

const API_BASE = "/api";

const CSRF_STORAGE_KEY = "csrfToken";

/**
 * Выполняет функцию `getCookie`.
 * @param name Входной параметр `name`.
 * @returns Результат выполнения `getCookie`.
 */

const getCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
};

/**
 * Выполняет функцию `getStoredCsrf`.
 * @returns Результат выполнения `getStoredCsrf`.
 */

const getStoredCsrf = () => {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(CSRF_STORAGE_KEY);
};

/**
 * Выполняет функцию `getCsrfToken`.
 * @returns Результат выполнения `getCsrfToken`.
 */

const getCsrfToken = () => getCookie("csrftoken") || getStoredCsrf();
/**
 * Выполняет функцию `setCsrfToken`.
 * @param token Входной параметр `token`.
 * @returns Результат выполнения `setCsrfToken`.
 */

const setCsrfToken = (token: string | null) => {
  if (typeof sessionStorage === "undefined") return;
  if (!token) {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
};

/**
 * Выполняет функцию `parseJson`.
 * @param text Входной параметр `text`.
 * @returns Результат выполнения `parseJson`.
 */

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Выполняет функцию `normalizeErrorPayload`.
 * @param payload Входной параметр `payload`.
 * @returns Результат выполнения `normalizeErrorPayload`.
 */

const normalizeErrorPayload = (
  payload: unknown,
): Record<string, unknown> | undefined => {
  if (!payload) return undefined;
  if (typeof payload === "string") {
    const parsed = parseJson(payload);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return { detail: payload };
  }
  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  return undefined;
};

/**
 * Выполняет функцию `extractErrorMessage`.
 * @returns Результат выполнения `extractErrorMessage`.
 */

const extractErrorMessage = (data?: Record<string, unknown>) => {
  if (!data) return undefined;
  const errors = data.errors as Record<string, string[]> | undefined;
  if (errors) {
    return Object.values(errors).flat().join(" ");
  }
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") return data.detail;
  return undefined;
};

/**
 * Выполняет функцию `normalizeAxiosError`.
 * @param error Входной параметр `error`.
 * @returns Результат выполнения `normalizeAxiosError`.
 */

export const normalizeAxiosError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status ?? 0;
    const data = normalizeErrorPayload(axiosError.response?.data);
    const message =
      /**
       * Выполняет метод `extractErrorMessage`.
       * @param data Входной параметр `data`.
       * @returns Результат выполнения `extractErrorMessage`.
       */

      extractErrorMessage(data) || axiosError.message || "Request failed";
    return { status, message, data };
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "message" in error
  ) {
    return error as ApiError;
  }

  return { status: 0, message: "Request failed" };
};

/**
 * Описывает назначение класса `ApiService`.
 */

class ApiService implements IApiService {
  private apiClient: AxiosInstance;

  public constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE,
      timeout: 10000,
      withCredentials: true,
    });

    this.apiClient.interceptors.request.use((config) => {
      const method = (config.method || "get").toLowerCase();
      const headers = AxiosHeaders.from(config.headers);
      const hasBody =
        method !== "get" && method !== "head" && method !== "options";
      const isFormData =
        typeof FormData !== "undefined" && config.data instanceof FormData;

      if (hasBody && !isFormData && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      if (hasBody && !headers.has("X-CSRFToken")) {
        const csrf = getCsrfToken();
        if (csrf) {
          headers.set("X-CSRFToken", csrf);
        }
      }

      if (isFormData) {
        headers.delete("Content-Type");
      }

      config.headers = headers;
      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(normalizeAxiosError(error)),
    );
  }

  /**
   * Выполняет метод `ensureCsrf`.
   * @returns Результат выполнения `ensureCsrf`.
   */

  public async ensureCsrf(): Promise<{ csrfToken: string }> {
    const data = await ensureCsrfRequest(this.apiClient);
    /**
     * Выполняет метод `setCsrfToken`.
     * @returns Результат выполнения `setCsrfToken`.
     */

    setCsrfToken(data.csrfToken || null);
    return data;
  }

  public async ensurePresenceSession(): Promise<{ ok: boolean }> {
    return await ensurePresenceSession(this.apiClient);
  }

  /**
   * Выполняет метод `getSession`.
   * @returns Результат выполнения `getSession`.
   */

  public async getSession() {
    return await getSession(this.apiClient);
  }

  /**
   * Выполняет метод `login`.
   * @param username Входной параметр `username`.
   * @param password Входной параметр `password`.
   * @returns Результат выполнения `login`.
   */

  public async login(username: string, password: string) {
    return await login(this.apiClient, username, password);
  }

  /**
   * Выполняет метод `register`.
   * @param username Входной параметр `username`.
   * @param password1 Входной параметр `password1`.
   * @param password2 Входной параметр `password2`.
   * @returns Результат выполнения `register`.
   */

  public async register(
    username: string,
    password1: string,
    password2: string,
  ) {
    return await register(this.apiClient, username, password1, password2);
  }

  /**
   * Выполняет метод `getPasswordRules`.
   * @returns Результат выполнения `getPasswordRules`.
   */

  public async getPasswordRules() {
    return await getPasswordRules(this.apiClient);
  }

  /**
   * Выполняет метод `logout`.
   * @returns Результат выполнения `logout`.
   */

  public async logout() {
    return await logout(this.apiClient);
  }

  /**
   * Выполняет метод `updateProfile`.
   * @param fields Входной параметр `fields`.
   * @returns Результат выполнения `updateProfile`.
   */

  public async updateProfile(fields: UpdateProfileInput) {
    return await updateProfile(this.apiClient, fields);
  }

  /**
   * Выполняет метод `getPublicRoom`.
   * @returns Результат выполнения `getPublicRoom`.
   */

  public async getPublicRoom() {
    return await getPublicRoom(this.apiClient);
  }

  /**
   * Выполняет метод `getRoomDetails`.
   * @param slug Входной параметр `slug`.
   * @returns Результат выполнения `getRoomDetails`.
   */

  public async getRoomDetails(slug: string) {
    return await getRoomDetails(this.apiClient, slug);
  }

  /**
   * Выполняет метод `getRoomMessages`.
   * @param slug Входной параметр `slug`.
   * @returns Результат выполнения `getRoomMessages`.
   */

  public async getRoomMessages(
    slug: string,
    params?: { limit?: number; beforeId?: number },
  ) {
    return await getRoomMessages(this.apiClient, slug, params);
  }

  /**
   * Выполняет метод `startDirectChat`.
   * @param username Входной параметр `username`.
   * @returns Результат выполнения `startDirectChat`.
   */

  public async startDirectChat(username: string) {
    return await startDirectChat(this.apiClient, username);
  }

  /**
   * Выполняет метод `getDirectChats`.
   * @returns Результат выполнения `getDirectChats`.
   */

  public async getDirectChats() {
    return await getDirectChats(this.apiClient);
  }

  /**
   * Выполняет метод `getUserProfile`.
   * @param username Входной параметр `username`.
   * @returns Результат выполнения `getUserProfile`.
   */

  public async getUserProfile(username: string) {
    return await getUserProfile(this.apiClient, username);
  }
}

export const apiService = new ApiService();
