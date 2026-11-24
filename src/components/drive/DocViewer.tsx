'use no memo';
// md・テキスト/コード・HTML のビューア。表示／生の切替、編集、保存時の3方向マージ、15秒ごとの更新確認
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MdView, isRel } from '@/components/drive/MdView';
import { MergeModal, type MergeAction, type MergeState } from '@/components/drive/MergeModal';
import { RawText } from '@/components/drive/RawText';
import { ViewerHeader } from '@/components/drive/ViewerHeader';
import { Loader } from '@/components/Loader';
import { PillSegment } from '@/components/PillSegment';
import { toast } from '@/components/Toast';
import { type DFile, fetchText, findByPath, getVersion, parentDirs, saveText } from '@/lib/drive/api';
import { getBody, putBodyText, readBodyText } from '@/lib/drive/cache';
import { diff3, mergedText } from '@/lib/drive/diff';
import { openFile } from '@/lib/drive/open';
import { ago, fmtSize, freshness } from '@/lib/drive/util';
import { useDiscardGuard } from '@/lib/discard';
import { MONO, useTheme } from '@/theme';

type K = 'md' | 'code' | 'html';
type Meta = { version: string; modifiedTime: string; size?: string };

export function DocViewer({ file, kind }: { file: DFile; kind: K }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState(file);
  const [text, setText] = useState<string | null>(null);
  const ver = useRef<string | null>(null);
  const [mode, setMode] = useState<'view' | 'raw'>('view');
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [draft, setDraft] = useState('');
  const editBase = useRef('');
  const editV = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [merge, setMerge] = useState<MergeState | null>(null);
  const notified = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const dirty = editing && draft !== editBase.current;
  const { close } = useDiscardGuard(dirty);

  const applyMeta = (m: Meta) =>
    setF((cur) => {
      const nf = {
        ...cur,
        version: m.version,
        modifiedTime: m.modifiedTime,
        t: Date.parse(m.modifiedTime),
        ...(m.size != null && { size: Number(m.size) }),
      };
      file.version = nf.version;
      file.t = nf.t;
      file.modifiedTime = nf.modifiedTime;
      return nf;
    });

  // 端末に保存した本文を先に出し、裏で版を確かめる。版が同じなら通信は版の確認1回だけ
  const load = useCallback(async () => {
    loadingRef.current = true;
    notified.current = null;
    try {
      const cached = await getBody(file.id);
      let shown = false;
      if (cached) {
        const s = await readBodyText(cached.path);
        if (s !== undefined) {
          setText(s);
          ver.current = cached.version;
          shown = true;
        }
      }
      const m = await getVersion(file.id);
      applyMeta(m);
      if (shown && cached && cached.version === m.version) return;
      const body = await fetchText(file.id);
      void putBodyText(file.id, m.version, body);
      if (editingRef.current) {
        notified.current = m.version;
        toast(`${file.name} が別の場所で更新されました`);
        return;
      }
      setText(body);
      ver.current = m.version;
    } catch (e) {
      console.warn('load', e);
      toast('読み込めませんでした');
    } finally {
      loadingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 画面が見えている間だけ15秒ごとに更新を見る
  useFocusEffect(
    useCallback(() => {
      const tick = async () => {
        if (AppState.currentState !== 'active') return;
        if (loadingRef.current || savingRef.current || ver.current == null) return;
        try {
          const m = await getVersion(file.id);
          if (savingRef.current) return;
          if (m.version !== ver.current && m.version !== notified.current) {
            notified.current = m.version;
            if (editingRef.current) toast(`${file.name} が別の場所で更新されました`);
            else {
              toast(`${file.name} が更新されたので再読込しました`);
              void load();
            }
          }
        } catch (e) {
          console.warn('更新の確認に失敗', e);
        }
      };
      const id = setInterval(tick, 15_000);
      return () => clearInterval(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file.id, load]),
  );

  /* ===== 編集 ===== */
  const enterEdit = () => {
    if (editingRef.current || text == null || loadingRef.current) return;
    editingRef.current = true;
    editBase.current = text;
    editV.current = ver.current;
    setDraft(text);
    setEditing(true);
    if (process.env.EXPO_PUBLIC_DRIVE_MOCK === '1') (require('@/lib/drive/mock') as typeof import('@/lib/drive/mock')).mockOnEdit(file.id);
  };
  const leaveEdit = () => {
    editingRef.current = false;
    notified.current = null;
    setEditing(false);
    setMode('view');
  };
  const persist = async (body: string) => {
    const r = await saveText(file.id, body, f.mimeType);
    applyMeta(r);
    setText(body);
    ver.current = r.version;
    void putBodyText(file.id, r.version, body);
  };
  const openMerge = (theirs: string, theirsV: string) => {
    const chunks = diff3(editBase.current.split('\n'), draft.split('\n'), theirs.split('\n'));
    setMerge({ chunks, theirsV, onlyChanges: true });
  };
  const saveEdit = async () => {
    if (savingRef.current) return;
    if (!dirty) {
      leaveEdit();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const cur = await getVersion(file.id);
      if (cur.version !== editV.current) {
        openMerge(await fetchText(file.id), cur.version);
        return;
      }
      await persist(draft);
      leaveEdit();
      toast('保存しました');
    } catch (e) {
      console.warn('save', e);
      toast('保存できませんでした');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const cancelEdit = () => {
    if (!dirty) return leaveEdit();
    Alert.alert('変更を破棄しますか', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '破棄', style: 'destructive', onPress: leaveEdit },
    ]);
  };
  const mergeAction = async (a: MergeAction) => {
    const ms = merge;
    if (!ms || a === 'cancel') {
      setMerge(null);
      return;
    }
    setMerge(null);
    if (a === 'reload') {
      leaveEdit();
      await load();
      toast('最新を読み込みました');
      return;
    }
    try {
      // 差分を見ている間にさらに更新されていたら、取り直して差分を出し直す
      const cur = await getVersion(file.id);
      if (cur.version !== ms.theirsV) {
        openMerge(await fetchText(file.id), cur.version);
        toast('さらに更新されていました');
        return;
      }
      await persist(a === 'merge' ? mergedText(ms.chunks) : draft);
      leaveEdit();
      toast(a === 'merge' ? 'マージして保存しました' : '上書きして保存しました');
    } catch (e) {
      console.warn('merge save', e);
      toast('保存できませんでした');
    }
  };

  /* ===== md の相対リンク ===== */
  const followLink = useCallback(
    async (href: string) => {
      try {
        const dir = await parentDirs(file);
        let rel = href.split(/[?#]/)[0];
        try {
          rel = decodeURIComponent(rel);
        } catch {
          // そのまま
        }
        for (const seg of rel.split('/')) {
          if (seg === '..') dir.pop();
          else if (seg && seg !== '.') dir.push(seg);
        }
        const path = dir.join('/');
        const target = path ? await findByPath(path) : null;
        if (!target) {
          toast('リンク先が見つかりません');
          return;
        }
        openFile(target);
      } catch (e) {
        console.warn('link', e);
        toast('リンク先を開けませんでした');
      }
    },
    [file],
  );

  const bottom = insets.bottom + 24;
  const editable = kind !== 'html';
  const modes: { key: 'view' | 'raw'; label: string }[] =
    kind === 'md'
      ? [
          { key: 'view', label: '表示' },
          { key: 'raw', label: '生' },
        ]
      : [
          { key: 'view', label: '描画' },
          { key: 'raw', label: '生' },
        ];
  const fr = freshness(f.t);

  let body;
  if (editing) {
    body = (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          scrollEnabled
          textAlignVertical="top"
          accessibilityLabel={`${file.name} を編集`}
          selectionColor={t.fresh}
          style={[styles.edit, { color: t.ink, fontFamily: MONO, paddingBottom: bottom }]}
        />
      </KeyboardAvoidingView>
    );
  } else if (text == null) {
    body = (
      <View style={{ padding: 26, alignItems: 'flex-start' }}>
        <Loader />
      </View>
    );
  } else if (kind === 'md' && mode === 'view') {
    body = <MdView text={text} onRelLink={followLink} bottom={bottom} />;
  } else if (kind === 'html' && mode === 'view') {
    body = (
      <WebView
        source={{ html: text, baseUrl: 'about:blank' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('about:') || r.url.startsWith('data:')}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    );
  } else {
    body = <RawText text={text} bottom={bottom} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.paper2 }}>
      <ViewerHeader
        file={f}
        onClose={close}
        edit={
          editable && text != null
            ? { editing, busy: saving, onEdit: enterEdit, onSave: () => void saveEdit(), onCancel: cancelEdit }
            : undefined
        }
      />
      {!editing ? (
        <View style={styles.sub}>
          <Text style={[styles.meta, { color: fr === 'fresh' ? t.fresh : t.ink2 }]} numberOfLines={1}>
            {ago(f.t)}に更新{f.size != null ? ` ・ ${fmtSize(f.size)}` : ''}
          </Text>
          {kind !== 'code' ? <PillSegment width={124} options={modes} value={mode} onChange={setMode} /> : null}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{body}</View>
      <MergeModal state={merge} onChange={setMerge} onAction={(a) => void mergeAction(a)} />
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  meta: { fontSize: 13, flexShrink: 1 },
  edit: { flex: 1, fontSize: 14, lineHeight: 21, paddingHorizontal: 16, paddingTop: 10 },
});
