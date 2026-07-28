'use strict';

// Minimal SMTP client (no dependencies). Supports implicit TLS (465),
// STARTTLS (587/25), AUTH PLAIN / AUTH LOGIN, and plain-text messages.

const net = require('net');
const tls = require('tls');

const CRLF = '\r\n';

function connect(opts) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(new Error(`SMTP connect failed: ${err.message}`));
    let socket;
    if (opts.secure) {
      socket = tls.connect({ host: opts.host, port: opts.port, servername: opts.host }, () => resolve(socket));
    } else {
      socket = net.connect({ host: opts.host, port: opts.port }, () => resolve(socket));
    }
    socket.setTimeout(opts.timeoutMs || 15000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
    socket.once('error', onError);
  });
}

class SmtpConversation {
  constructor(socket) {
    this.buffer = '';
    this.waiters = [];
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      this.drain();
    });
    socket.on('error', (err) => this.fail(err));
    socket.on('close', () => this.fail(new Error('SMTP connection closed unexpectedly')));
  }

  detach() {
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('close');
  }

  fail(err) {
    while (this.waiters.length) this.waiters.shift().reject(err);
  }

  drain() {
    // A reply is complete when the last line is "NNN text" (space, not hyphen).
    const lines = this.buffer.split(CRLF);
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const reply = lines.slice(0, i + 1).join(CRLF);
        this.buffer = lines.slice(i + 1).join(CRLF);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(reply);
        return this.drain();
      }
    }
  }

  read() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.drain();
    });
  }

  async cmd(line, expectCodes) {
    if (line != null) this.socket.write(line + CRLF);
    const reply = await this.read();
    const code = parseInt(reply.slice(0, 3), 10);
    if (expectCodes && !expectCodes.includes(code)) {
      throw new Error(`SMTP error after "${line ? line.split(' ')[0] : 'connect'}": ${reply.split(CRLF)[0]}`);
    }
    return { code, reply };
  }
}

function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

async function sendMail(config, message) {
  const port = Number(config.port) || (config.secure ? 465 : 587);
  const socket = await connect({ host: config.host, port, secure: !!config.secure });
  const convo = new SmtpConversation(socket);
  try {
    await convo.cmd(null, [220]); // greeting
    let { reply } = await convo.cmd(`EHLO pulsewatch.local`, [250]);

    if (!config.secure && /STARTTLS/i.test(reply)) {
      await convo.cmd('STARTTLS', [220]);
      convo.detach();
      const secured = await new Promise((resolve, reject) => {
        const s = tls.connect({ socket, servername: config.host }, () => resolve(s));
        s.once('error', reject);
      });
      convo.attach(secured);
      ({ reply } = await convo.cmd(`EHLO pulsewatch.local`, [250]));
    }

    if (config.username) {
      if (/AUTH[ =][^\r\n]*PLAIN/i.test(reply)) {
        const token = Buffer.from(`\0${config.username}\0${config.password || ''}`, 'utf8').toString('base64');
        await convo.cmd(`AUTH PLAIN ${token}`, [235]);
      } else {
        await convo.cmd('AUTH LOGIN', [334]);
        await convo.cmd(Buffer.from(config.username, 'utf8').toString('base64'), [334]);
        await convo.cmd(Buffer.from(config.password || '', 'utf8').toString('base64'), [235]);
      }
    }

    const from = config.from || config.username;
    const recipients = String(message.to || config.to || '')
      .split(',').map((r) => r.trim()).filter(Boolean);
    if (!recipients.length) throw new Error('no recipients configured');

    await convo.cmd(`MAIL FROM:<${from}>`, [250]);
    for (const rcpt of recipients) {
      await convo.cmd(`RCPT TO:<${rcpt}>`, [250, 251]);
    }
    await convo.cmd('DATA', [354]);

    const body = String(message.text || '').replace(/\r?\n/g, CRLF).replace(/^\./gm, '..');
    const data = [
      `From: ${encodeHeader(config.fromName || 'PulseWatch')} <${from}>`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${encodeHeader(message.subject || '(no subject)')}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      '.'
    ].join(CRLF);
    await convo.cmd(data, [250]);
    await convo.cmd('QUIT', [221]).catch(() => {});
  } finally {
    convo.detach();
    convo.socket.destroy();
    socket.destroy();
  }
}

module.exports = { sendMail };
