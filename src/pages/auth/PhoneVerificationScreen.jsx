import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet';

const PhoneVerificationScreen = () => {
  const { toast } = useToast();
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState(new Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  const phone = location.state?.phone || 'your phone number';

  const handleChange = (element, index) => {
    if (isNaN(element.value)) return false;

    setOtp([...otp.map((d, idx) => (idx === index ? element.value : d))]);

    if (element.nextSibling) {
      element.nextSibling.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const code = otp.join("");
    if (code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the full 6-digit code.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { error } = await verifyOtp(phone, code);

    if (error) {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success!",
        description: "Your phone number has been verified.",
      });
      navigate('/home');
    }
    setLoading(false);
  };

  const siteUrl = "https://familyplaybook.app";
  const defaultImage = "/icon-192x192.png";

  return (
    <>
      <Helmet>
        <title>Verify Your Phone - Family Playbook</title>
        <meta name="description" content="Enter the verification code sent to your phone to complete the sign-up process." />
        <meta property="og:title" content="Verify Your Phone - Family Playbook" />
        <meta property="og:description" content="Enter the verification code sent to your phone to complete the sign-up process." />
        <meta property="og:image" content={defaultImage} />
        <meta property="og:url" content={`${siteUrl}/verify-phone`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Verify Your Phone - Family Playbook" />
        <meta name="twitter:description" content="Enter the verification code sent to your phone to complete the sign-up process." />
        <meta name="twitter:image" content={defaultImage} />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-[#5CA9E9]/10 via-[#7BC47F]/10 to-[#FFB88C]/10 flex flex-col p-6">
        <div className="flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/login')}
            className="rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm backdrop-blur-sm"
          >
            <ArrowLeft size={24} className="text-gray-800 dark:text-gray-100" />
          </Button>
        </div>

        <div className="flex-grow flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Verify your phone</h1>
            <p className="text-gray-600 mb-8">
              We've sent a 6-digit code to {phone}. Please enter it below.
            </p>

            <div className="flex justify-center gap-2 mb-8">
              {otp.map((data, index) => {
                return (
                  <input
                    ref={el => inputRefs.current[index] = el}
                    className="w-12 h-14 text-center text-2xl font-semibold border-2 border-gray-300 rounded-lg focus:border-[#5CA9E9] focus:outline-none transition-colors"
                    type="text"
                    name="otp"
                    maxLength="1"
                    key={index}
                    value={data}
                    onChange={e => handleChange(e.target, index)}
                    onKeyDown={e => handleKeyDown(e, index)}
                    onFocus={e => e.target.select()}
                  />
                );
              })}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-[#5CA9E9] to-[#7BC47F] hover:shadow-lg transition-all"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Verify'}
            </Button>

            <p className="text-sm text-gray-500 mt-6">
              Didn't receive a code? <button className="font-semibold text-[#5CA9E9] hover:underline">Resend</button>
            </p>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PhoneVerificationScreen;