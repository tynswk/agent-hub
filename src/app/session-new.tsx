import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field } from '@/components/Form';
import { GlassMenu } from '@/components/GlassMenu';
import { PillSegment } from '@/components/PillSegment';
import { Press } from '@/components/Press';
import { SheetHeader } from '@/components/SheetHeader';
import { toast } from '@/components/Toast';
import type { StartFile } from '@/lib/api';
import { useDiscardGuard } from '@/lib/discard';
import { AGY_MODELS, CLAUDE_MODELS, EFFORTS, type Kind } from '@/lib/models';
import { beginSession } from '@/lib/sessions';
import { useTheme } from '@/theme';

function Pick({ label, onOpen }: { label: string; onOpen: () => void }) {
  const t = useTheme();
  return (
    <Press
      mode="dim"
      onPress={onOpen}
      style={[styles.pick, { backgroundColor: t.field, borderColor: t.glassBrd }]}
    >
      <Text style={{ color: t.ink, fontSize: 15.5, flexShrink: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={17} color={t.ink2} />
    </Press>
  );
}

export default function NewSessionSheet() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>('claude');
  const [model, setModel] = useState<Record<Kind, string>>({
    claude: CLAUDE_MODELS[0][0],
    agy: AGY_MODELS[0][0],
  });
  const [effort, setEffort] = useState('medium');
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<StartFile | null>(null);
  const { close, leave } = useDiscardGuard(prompt.trim() !== '' || !!file);

  const models = kind === 'claude' ? CLAUDE_MODELS : AGY_MODELS;
  const modelId = model[kind];
  const modelLabel = models.find(([v]) => v === modelId)?.[1] ?? modelId;
  const effortLabel = EFFORTS.find(([v]) => v === effort)?.[1] ?? '';

  const pickPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const a = res.canceled ? null : res.assets[0];
      if (!a) return;
      setFile({
        uri: a.uri,
        name: a.fileName || a.uri.split('/').pop() || 'photo.jpg',
        mime: a.mimeType || 'image/jpeg',
      });
    } catch {
      toast('写真を選べませんでした');
    }
  };
  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      const a = res.canceled ? null : res.assets[0];
      if (!a) return;
      setFile({ uri: a.uri, name: a.name, mime: a.mimeType || 'application/octet-stream' });
    } catch {
      toast('ファイルを選べませんでした');
    }
  };

  const start = () => {
    const req = { kind, model: modelId, effort, prompt: prompt.trim() };
    leave();
    void beginSession(req, file);
  };

  const input = [styles.inp, { backgroundColor: t.field, borderColor: t.glassBrd, color: t.ink }];

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SheetHeader title="新規セッション" onClose={close} onOk={start} okIcon="play" okLabel="セッションを開始" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.seg}>
          <PillSegment
            options={[
              { key: 'claude', label: 'Claude' },
              { key: 'agy', label: 'Gemini' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </View>
        <Field label="モデル">
          <GlassMenu
            selectedKey={modelId}
            items={models.map(([v, n]) => ({
              key: v,
              label: n,
              onSelect: () => setModel((m) => ({ ...m, [kind]: v })),
            }))}
          >
            {(open) => <Pick label={modelLabel} onOpen={open} />}
          </GlassMenu>
        </Field>
        {kind === 'claude' ? (
          <Field label="エフォート">
            <GlassMenu
              selectedKey={effort}
              items={EFFORTS.map(([v, n]) => ({ key: v, label: n, onSelect: () => setEffort(v) }))}
            >
              {(open) => <Pick label={effortLabel} onOpen={open} />}
            </GlassMenu>
          </Field>
        ) : null}
        <Field column>
          <View style={styles.labrow}>
            <Text style={{ color: t.ink2, fontSize: 13.5 }}>プロンプト</Text>
            <GlassMenu
              items={[
                { key: 'photo', label: '写真', onSelect: () => void pickPhoto() },
                { key: 'file', label: 'ファイル', onSelect: () => void pickFile() },
              ]}
            >
              {(open) => (
                <Press
                  mode="dim"
                  onPress={open}
                  style={[styles.plus, { borderColor: t.glassBrd, backgroundColor: t.field }]}
                  accessibilityLabel="ファイルを添付"
                >
                  <Plus size={17} color={t.ink} />
                </Press>
              )}
            </GlassMenu>
          </View>
          <TextInput
            style={[...input, styles.ta]}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlignVertical="top"
            autoComplete="off"
          />
          {file ? (
            <View style={[styles.chip, { backgroundColor: t.field, borderColor: t.glassBrd }]}>
              <Text style={{ color: t.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {file.name}
              </Text>
              <Press mode="dim" onPress={() => setFile(null)} style={styles.chipX} accessibilityLabel="添付を外す">
                <X size={15} color={t.ink2} />
              </Press>
            </View>
          ) : null}
        </Field>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  seg: { alignItems: 'center', paddingVertical: 14 },
  pick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  labrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plus: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inp: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  ta: { minHeight: 150 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  chipX: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
