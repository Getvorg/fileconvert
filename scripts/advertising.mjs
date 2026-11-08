// Google Privacy & messaging is optional. No advertising code is generated here.
export function advertisingConfig(env=process.env){
 const publisher=env.GOOGLE_CMP_PUBLISHER_ID?.trim()||'';
 if(publisher&&!/^pub-\d{16}$/.test(publisher))throw Error('GOOGLE_CMP_PUBLISHER_ID must be pub- followed by 16 digits');
 return {publisher,enabled:!!publisher};
}
export function consentHead(config){return config.enabled?`<script src="/consent.js" data-publisher="${config.publisher}" defer></script>`:'';}
export function consentFooter(config,ru){return config.enabled?`<button type="button" class="privacy-settings" data-consent-settings hidden>${ru?'Настройки конфиденциальности':'Privacy settings'}</button><span class="consent-status" role="status" data-consent-status></span>`:'';}
