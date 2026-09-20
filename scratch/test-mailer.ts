import { sendOtpEmail } from '../lib/mailer.js'; // Might need to compile it or just use tsx

async function test() {
  const result = await sendOtpEmail({
    to: 'ronitparmar24@gmail.com',
    name: 'Ronit',
    code: '123456'
  });
  console.log(result);
}

test();
