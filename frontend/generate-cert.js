async function main() {
  const [{ default: selfsigned }, fs] = await Promise.all([
    import('selfsigned'),
    import('node:fs'),
  ]);

  const host = process.env.HOST || 'powergold.home.arpa';
  const lanIp = process.env.LAN_IP?.trim();
  const isIpv4Host = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const attrs = [{ name: 'commonName', value: host }];

  try {
    const pems = await selfsigned.generate(attrs, {
      algorithm: 'sha256',
      days: 365,
      keySize: 2048,
      extensions: [{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: isIpv4Host ? undefined : host },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: isIpv4Host ? host : undefined },
          { type: 7, ip: lanIp && /^\d+\.\d+\.\d+\.\d+$/.test(lanIp) ? lanIp : undefined },
        ].filter((name) => name.value !== undefined || name.ip !== undefined),
      }],
    });

    fs.mkdirSync('./certificates', { recursive: true });
    const cert = pems.cert || pems.public;
    fs.writeFileSync('./certificates/localhost.pem', cert);
    fs.writeFileSync('./certificates/localhost-key.pem', pems.private);
    console.log(`Certificates generated for ${host} in ./certificates/`);
  } catch (error) {
    console.error(error);
  }
}

main();
