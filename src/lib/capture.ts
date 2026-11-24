import * as ImagePicker from 'expo-image-picker';
import { toast } from '@/components/Toast';
import { stageReceipt } from '@/lib/local';

export async function capture(fromLibrary: boolean) {
  try {
    if (!fromLibrary) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast('カメラの許可がありません');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const res = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync(opts)
      : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await stageReceipt(a.uri, a.width, a.height);
  } catch {
    toast('レシートを端末に保存できませんでした');
  }
}
