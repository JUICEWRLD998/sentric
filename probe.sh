#!/bin/bash
doh_lookup() {
  curl -s --max-time 8 "https://dns.google/resolve?name=$1&type=A" | python -c "import sys,json; d=json.load(sys.stdin); print(' '.join(a['data'] for a in d.get('Answer',[]) if a.get('type')==1) or 'NONE')" 2>/dev/null
}
for h in api.binance.com www.okx.com api.kraken.com api.coinbase.com api.gemini.com api.bitfinex.com api.bitstamp.net api.bybit.com api.kucoin.com; do
  ips=$(doh_lookup "$h")
  echo "== $h -> $ips"
  for ip in $ips; do
    code=$(curl -s -o /dev/null --max-time 6 --resolve "$h:443:$ip" -w '%{http_code}' "https://$h" 2>/dev/null)
    echo "   pinned $ip -> HTTP $code"
  done
done
