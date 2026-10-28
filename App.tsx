import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { bridgeScript, RESUME_SCRIPT } from "./src/web-bridge";
import {
  isCalendarReturn,
  isCalendarStart,
  isTrustedPage,
  navigationAction,
  parseSharedFile,
  validatedOrigin,
} from "./src/navigation";

const APP_ORIGIN = validatedOrigin(
  process.env.EXPO_PUBLIC_APP_URL || "https://app.pentaworks.net",
);
const INJECTED_SCRIPT = bridgeScript(APP_ORIGIN);

export default function App() {
  return (
    <SafeAreaProvider>
      <MReyesApp />
    </SafeAreaProvider>
  );
}

function MReyesApp() {
  const web = useRef<WebView<object>>(null);
  const currentUrl = useRef(APP_ORIGIN + "/");
  const canGoBack = useRef(false);
  const sharing = useRef(false);
  const openingCalendar = useRef(false);
  const [source, setSource] = useState(APP_ORIGIN + "/");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearLoadTimeout = useCallback(() => {
    clearTimeout(timeout.current);
  }, []);
  const refreshCalendar = useCallback(() => {
    if (isTrustedPage(currentUrl.current, APP_ORIGIN))
      web.current?.injectJavaScript(RESUME_SCRIPT);
  }, []);
  const returnToApp = useCallback(() => {
    refreshCalendar();
    // On a cold launch or another route, take the user to the authenticated settings page.
    if (new URL(currentUrl.current).pathname !== "/settings")
      setSource(APP_ORIGIN + "/settings#google-calendar");
  }, [refreshCalendar]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (isCalendarReturn(url)) returnToApp();
    });
    void Linking.getInitialURL()
      .then((url) => {
        if (url && isCalendarReturn(url)) returnToApp();
      })
      .catch(() => {});
    const state = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshCalendar();
    });
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => {
      subscription.remove();
      state.remove();
      back.remove();
      clearLoadTimeout();
    };
  }, [returnToApp, refreshCalendar, clearLoadTimeout]);

  async function openExternal(url: string) {
    const action = navigationAction(url, APP_ORIGIN);
    if (action !== "external" && action !== "calendar") return;
    if (action === "calendar" && openingCalendar.current) return;
    try {
      if (action === "calendar") {
        openingCalendar.current = true;
      }
      // The system browser owns OAuth cookies from start through callback.
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "브라우저를 열지 못했습니다",
        "브라우저 설치 상태를 확인하고 다시 시도해주세요.",
      );
    } finally {
      openingCalendar.current = false;
    }
  }

  async function onMessage(event: WebViewMessageEvent) {
    if (
      !isTrustedPage(event.nativeEvent.url, APP_ORIGIN) ||
      !isTrustedPage(currentUrl.current, APP_ORIGIN)
    )
      return;
    const data = event.nativeEvent.data;
    if (data.length > 22 * 1024 * 1024) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (
      message.type === "calendar-connect" &&
      typeof message.url === "string" &&
      isCalendarStart(message.url, APP_ORIGIN)
    ) {
      await openExternal(message.url);
    } else if (message.type === "share-file") {
      const file = parseSharedFile(message);
      if (!file) {
        Alert.alert(
          "파일을 열 수 없습니다",
          "PDF·이미지·CSV·Excel 파일을 15MB까지 지원합니다.",
        );
        return;
      }
      if (sharing.current) return;
      sharing.current = true;
      let path: string | undefined;
      try {
        if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
          throw new Error();
        path = FileSystem.cacheDirectory + `${Date.now()}-${file.name}`;
        await FileSystem.writeAsStringAsync(path, file.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(path, {
          mimeType: file.mime,
          dialogTitle: "MReyes 파일 저장·공유",
        });
      } catch {
        Alert.alert("파일을 열지 못했습니다", "다시 시도해주세요.");
      } finally {
        if (path)
          await FileSystem.deleteAsync(path, { idempotent: true }).catch(
            () => {},
          );
        sharing.current = false;
      }
    } else if (message.type === "file-error") {
      Alert.alert(
        "파일을 열지 못했습니다",
        "파일 크기와 네트워크를 확인하고 다시 시도해주세요.",
      );
    }
  }

  function shouldLoad(url: string) {
    const action = navigationAction(url, APP_ORIGIN);
    if (action === "internal") return true;
    if (action === "external" || action === "calendar") void openExternal(url);
    else if (url.startsWith("https://accounts.google.com/")) {
      Alert.alert(
        "캘린더 연결 안내",
        "앱용 연동 기능이 웹 서버에 적용되어야 합니다. 현재는 외부 브라우저에서 MReyes에 로그인한 뒤 연동해주세요.",
        [
          { text: "취소", style: "cancel" },
          {
            text: "브라우저에서 열기",
            onPress: () => {
              void Linking.openURL(
                APP_ORIGIN + "/settings#google-calendar",
              ).catch(() => {});
            },
          },
        ],
      );
    }
    return false;
  }

  function retry() {
    clearLoadTimeout();
    setFailure(false);
    setLoading(true);
    web.current?.reload();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <WebView<object>
          ref={web}
          source={{ uri: source }}
          style={styles.web}
          applicationNameForUserAgent="MReyesNative/1"
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.isTopFrame === false &&
              !isTrustedPage(request.url, APP_ORIGIN)
            )
              return false;
            return shouldLoad(request.url);
          }}
          onOpenWindow={({ nativeEvent }) => {
            if (
              navigationAction(nativeEvent.targetUrl, APP_ORIGIN) === "internal"
            )
              setSource(nativeEvent.targetUrl);
            else shouldLoad(nativeEvent.targetUrl);
          }}
          onNavigationStateChange={(state) => {
            currentUrl.current = state.url;
            canGoBack.current = state.canGoBack;
          }}
          injectedJavaScriptBeforeContentLoaded={INJECTED_SCRIPT}
          injectedJavaScript={INJECTED_SCRIPT}
          onMessage={(event) => {
            void onMessage(event);
          }}
          onLoadStart={() => {
            clearLoadTimeout();
            setLoading(true);
            timeout.current = setTimeout(() => {
              setLoading(false);
              setFailure(true);
            }, 30_000);
          }}
          onLoadEnd={() => {
            clearLoadTimeout();
            setLoading(false);
          }}
          onError={() => {
            clearLoadTimeout();
            setLoading(false);
            setFailure(true);
          }}
          onHttpError={({ nativeEvent }) => {
            if (
              nativeEvent.statusCode >= 400 &&
              nativeEvent.url.split("#")[0] === currentUrl.current.split("#")[0]
            ) {
              setFailure(true);
              setLoading(false);
            }
          }}
          onContentProcessDidTerminate={() => {
            setFailure(true);
            setLoading(false);
          }}
          onRenderProcessGone={() => {
            setFailure(true);
            setLoading(false);
          }}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled={false}
          sharedCookiesEnabled={false}
          mixedContentMode="never"
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          webviewDebuggingEnabled={__DEV__}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          setSupportMultipleWindows
          textZoom={100}
        />
        {loading && !failure && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color="#123b5d" />
            <Text style={styles.loadingText}>MReyes를 불러오고 있습니다</Text>
          </View>
        )}
        {failure && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.brand}>MReyes</Text>
            <Text style={styles.title}>연결을 확인해주세요</Text>
            <Text style={styles.description}>
              화면을 불러오지 못했습니다.{"\n"}네트워크를 확인한 뒤 다시
              시도해주세요.
            </Text>
            <Pressable
              style={styles.button}
              onPress={retry}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>다시 시도</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#123b5d" },
  content: { flex: 1, backgroundColor: "#fff" },
  web: { flex: 1 },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f6f9",
  },
  loadingText: { fontSize: 13, color: "#123b5d" },
  error: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#f3f6f9",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  brand: {
    fontSize: 18,
    fontWeight: "800",
    color: "#123b5d",
    marginBottom: 24,
  },
  title: { fontSize: 23, fontWeight: "700", color: "#123b5d" },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: "#405365",
    textAlign: "center",
    marginVertical: 20,
  },
  button: {
    paddingHorizontal: 36,
    paddingVertical: 16,
    backgroundColor: "#123b5d",
    borderRadius: 12,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
