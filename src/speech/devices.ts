/**
 * 音频设备枚举。
 *
 * 权限未授予时设备名是空的，调用方需要提示用户先授权。
 */

export interface AudioDevices {
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
  /** 设备名是否可见，false 表示缺少录音权限。 */
  labeled: boolean
}

export async function listAudioDevices(): Promise<AudioDevices> {
  if (!navigator.mediaDevices?.enumerateDevices)
    return { inputs: [], outputs: [], labeled: false }

  const devices = await navigator.mediaDevices.enumerateDevices()
  const inputs = devices.filter(device => device.kind === 'audioinput')
  const outputs = devices.filter(device => device.kind === 'audiooutput')

  return {
    inputs,
    outputs,
    labeled: inputs.every(device => device.label !== '') || outputs.every(device => device.label !== ''),
  }
}
