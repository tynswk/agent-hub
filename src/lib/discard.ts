import { useNavigation, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

// 入力途中のシートを閉じようとしたときだけ破棄の確認を出す（× でも、下に引いて閉じるときでも）。
// 戻り値の leave() は確認なしで閉じる（✓ の確定後）。close() は通常の閉じる（dirty なら確認）。
export function useDiscardGuard(dirty: boolean) {
  const navigation = useNavigation();
  const [discarded, setDiscarded] = useState(false);
  const disablePrevention = usePreventRemove(dirty && !discarded, ({ repeat }) => {
    Alert.alert('入力を破棄しますか', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '破棄',
        style: 'destructive',
        onPress: () => {
          setDiscarded(true);
          repeat();
        },
      },
    ]);
  });
  return {
    close: () => navigation.goBack(),
    leave: () => {
      disablePrevention();
      setDiscarded(true);
      navigation.goBack();
    },
  };
}
