'use no memo';
// 画像・PDF・動画/音声・その他のビューア本体
import { Image } from 'expo-image';
import { ExternalLink, Music, Pause, Play } from 'lucide-react-native';
import { VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { toast } from '@/components/Toast';
import { type DFile, authHeaders, contentUrl, downloadToCache, getVersion } from '@/lib/drive/api';
import { getBody } from '@/lib/drive/cache';
import { media, openMedia, seekTo, setRate, togglePlay } from '@/lib/drive/media';
import { mmss } from '@/lib/drive/util';
import { useTheme } from '@/theme';

export const driveUrl = (f: DFile) => `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`;

export function OpenInDrive({ file }: { file: DFile }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <Press
        onPress={() => void Linking.openURL(driveUrl(file))}
        style={[styles.btn, { backgroundColor: t.field, borderColor: t.glassBrd }]}
      >
        <ExternalLink size={18} color={t.ink} />
        <Text style={[styles.btnText, { color: t.ink }]}>Driveで開く</Text>
      </Press>
    </View>
  );
}

export function ImageBody({ file, bottom }: { file: DFile; bottom: number }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    authHeaders().then(setHeaders).catch(() => toast('読み込めませんでした'));
  }, [file.id]);
  if (!headers) {
    return (
      <View style={{ padding: 26, alignItems: 'flex-start' }}>
        <Loader />
      </View>
    );
  }
  const source =
    process.env.EXPO_PUBLIC_DRIVE_MOCK === '1'
      ? (require('../../../assets/bg.jpg') as number)
      : { uri: contentUrl(file.id), headers };
  return (
    <ScrollView
      maximumZoomScale={6}
      minimumZoomScale={1}
      centerContent
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', minHeight: height - 200 - bottom }}
      style={{ flex: 1, backgroundColor: t.paper2 }}
    >
      <Image
        source={source}
        contentFit="contain"
        style={{ width, height: height - 200 }}
        onError={() => toast('読み込めませんでした')}
        accessibilityLabel={file.name}
      />
    </ScrollView>
  );
}

export function PdfBody({ file }: { file: DFile }) {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'android') return; // Android の WebView は PDF を描けない
    let live = true;
    (async () => {
      try {
        const [cached, m] = await Promise.all([getBody(file.id), getVersion(file.id)]);
        const path =
          cached && cached.version === m.version ? cached.path : await downloadToCache(file, 'pdf', m.version);
        if (live) setUri(path);
      } catch (e) {
        console.warn('pdf', e);
        toast('読み込めませんでした');
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);
  if (Platform.OS === 'android') return <OpenInDrive file={file} />;
  if (!uri) {
    return (
      <View style={{ padding: 26, alignItems: 'flex-start' }}>
        <Loader />
      </View>
    );
  }
  return (
    <WebView
      source={{ uri }}
      originWhitelist={['file://*']}
      allowFileAccess
      allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)}
      style={{ flex: 1, backgroundColor: t.paper2 }}
    />
  );
}

const RATES = [0.75, 1, 1.25, 1.5, 1.8, 2];

function SeekBar() {
  const t = useTheme();
  const m = media.use();
  const [w, setW] = useState(1);
  const frac = m.duration > 0 ? Math.min(1, m.time / m.duration) : 0;
  const seek = (x: number) => {
    if (m.duration > 0) seekTo((Math.max(0, Math.min(w, x)) / w) * m.duration);
  };
  return (
    <View>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => seek(e.nativeEvent.locationX)}
        onResponderMove={(e) => seek(e.nativeEvent.locationX)}
        style={{ height: 28, justifyContent: 'center' }}
      >
        <View style={[styles.track, { backgroundColor: t.line }]}>
          <View style={{ width: `${frac * 100}%`, height: 4, borderRadius: 2, backgroundColor: t.fresh }} />
        </View>
      </View>
      <View style={styles.times}>
        <Text style={[styles.time, { color: t.ink2 }]}>{mmss(m.time)}</Text>
        <Text style={[styles.time, { color: t.ink2 }]}>{mmss(m.duration)}</Text>
      </View>
    </View>
  );
}

export function MediaBody({ file }: { file: DFile }) {
  const t = useTheme();
  const m = media.use();
  const isVideo = file.mimeType.startsWith('video/');
  useEffect(() => {
    media.set({ viewerOpen: true });
    void openMedia(file);
    return () => media.set({ viewerOpen: false });
  }, [file]);
  const mine = m.file?.id === file.id;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {isVideo ? (
        m.player && mine ? (
          <VideoView
            player={m.player}
            style={styles.video}
            contentFit="contain"
            nativeControls
            allowsPictureInPicture
            startsPictureInPictureAutomatically
          />
        ) : (
          <View style={[styles.video, { backgroundColor: '#000' }]} />
        )
      ) : (
        <View style={[styles.art, { backgroundColor: t.field, borderColor: t.glassBrd }]}>
          <Music size={54} color={t.ink2} strokeWidth={1.5} />
        </View>
      )}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 14 }}>
        {!isVideo ? (
          <>
            <SeekBar />
            <View style={{ alignItems: 'center' }}>
              <Press
                mode="dim"
                onPress={togglePlay}
                style={[styles.play, { backgroundColor: t.field, borderColor: t.glassBrd }]}
                accessibilityLabel={m.playing ? '一時停止' : '再生'}
              >
                {m.playing ? (
                  <Pause size={26} color={t.ink} fill={t.ink} />
                ) : (
                  <Play size={26} color={t.ink} fill={t.ink} style={{ marginLeft: 3 }} />
                )}
              </Press>
            </View>
          </>
        ) : null}
        <View style={styles.chips}>
          {RATES.map((r) => {
            const on = m.rate === r;
            return (
              <Press
                key={r}
                mode="dim"
                onPress={() => setRate(r)}
                style={[
                  styles.chip,
                  { borderColor: on ? t.fresh : t.glassBrd, backgroundColor: on ? t.pillOn : t.field },
                ]}
              >
                <Text style={{ color: on ? t.fresh : t.ink2, fontSize: 14, fontWeight: '700' }}>{r}×</Text>
              </Press>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: { fontSize: 16, fontWeight: '600' },
  video: { width: '100%', aspectRatio: 16 / 9 },
  art: {
    width: 180,
    height: 180,
    borderRadius: 24,
    borderWidth: 1,
    alignSelf: 'center',
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  play: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { minWidth: 56, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});
