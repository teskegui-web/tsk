import type { ImagePickerAsset } from 'expo-image-picker';
export async function documentImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new window.Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Não foi possível ler esta imagem.')); img.src = asset.uri; });
  const ratio = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não oferece leitura de imagens.');
  context.fillStyle = '#FFF'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/jpeg', 0.8);
  return { ...asset, uri, base64: uri.split(',')[1], mimeType: 'image/jpeg', width: canvas.width, height: canvas.height };
}
