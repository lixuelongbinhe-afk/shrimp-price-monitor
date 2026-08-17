import { spawn } from "node:child_process";
import type { CredentialStore } from "../domain/providers.js";

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CredApi {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CREDENTIAL { public uint Flags; public uint Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
 [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
 [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
 [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredDelete(string target, uint type, uint flags);
 [DllImport("advapi32.dll", SetLastError=true)] public static extern void CredFree(IntPtr buffer);
 public static void Write(string target,string secret) { byte[] bytes=Encoding.Unicode.GetBytes(secret); IntPtr ptr=Marshal.AllocCoTaskMem(bytes.Length); try { Marshal.Copy(bytes,0,ptr,bytes.Length); var c=new CREDENTIAL{Type=1,TargetName=target,CredentialBlobSize=(uint)bytes.Length,CredentialBlob=ptr,Persist=2,UserName=Environment.UserName}; if(!CredWrite(ref c,0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); } finally { Marshal.ZeroFreeCoTaskMemUnicode(ptr); } }
 public static string Read(string target) { IntPtr ptr; if(!CredRead(target,1,0,out ptr)) { int e=Marshal.GetLastWin32Error(); if(e==1168) return null; throw new System.ComponentModel.Win32Exception(e); } try { var c=Marshal.PtrToStructure<CREDENTIAL>(ptr); return Marshal.PtrToStringUni(c.CredentialBlob,(int)c.CredentialBlobSize/2); } finally { CredFree(ptr); } }
 public static void Delete(string target) { if(!CredDelete(target,1,0)) { int e=Marshal.GetLastWin32Error(); if(e!=1168) throw new System.ComponentModel.Win32Exception(e); } }
}
'@
if ($inputData.operation -eq 'get') { $v=[CredApi]::Read($inputData.target); if ($null -ne $v) {[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v))} }
elseif ($inputData.operation -eq 'set') { [CredApi]::Write($inputData.target,[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputData.secret))) }
elseif ($inputData.operation -eq 'delete') { [CredApi]::Delete($inputData.target) }
`;

export class WindowsCredentialStore implements CredentialStore {
  constructor(private readonly target = "ShrimpPriceMonitor/DeepSeekApiKey") {
    if (process.platform !== "win32") throw new Error("WindowsCredentialStore 仅支持 Windows");
  }
  async get(): Promise<string | null> {
    const output = await invoke({ operation: "get", target: this.target });
    return output ? Buffer.from(output, "base64").toString("utf8") : null;
  }
  async set(secret: string): Promise<void> {
    if (!secret.trim()) throw new Error("API Key 不能为空");
    await invoke({ operation: "set", target: this.target, secret: Buffer.from(secret, "utf8").toString("base64") });
  }
  async delete(): Promise<void> { await invoke({ operation: "delete", target: this.target }); }
}

function invoke(payload: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCRIPT], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`Windows 凭据操作失败 (${code}): ${stderr.trim()}`)));
    child.stdin.end(JSON.stringify(payload));
  });
}
