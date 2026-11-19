import { Alert, Platform } from 'react-native';
export function confirmAction(title: string, message: string, label: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${message}`)) onConfirm(); }
  else Alert.alert(title, message, [{ text: 'Cancelar', style: 'cancel' }, { text: label, onPress: onConfirm }]);
}
