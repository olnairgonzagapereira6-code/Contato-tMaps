
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

interface FileUploadProps {
  onUpload: (filePath: string) => void;
  bucketName: string; // e.g., 'chat_files', 'documents'
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, bucketName }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select a file to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      onUpload(filePath);
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label htmlFor="file-upload" className="button primary block">
        {uploading ? 'Uploading...' : 'Upload File'}
      </label>
      <input
        style={{ visibility: 'hidden', position: 'absolute' }}
        id="file-upload"
        type="file"
        onChange={handleFileUpload}
        disabled={uploading}
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default FileUpload;
