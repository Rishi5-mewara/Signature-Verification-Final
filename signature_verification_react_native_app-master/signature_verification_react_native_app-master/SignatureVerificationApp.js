import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const API_BASE_URL = 'http://192.168.1.103:8000'; // Replace with your actual API base URL

// cont API_BASE_URL = "https://rishimewara.com/signature-verification-api"; // Replace with your actual API base URL

const SignatureVerificationApp = () => {
  // State variables to manage app data
  const [firstImage, setFirstImage] = useState(null);
  const [secondImage, setSecondImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  
  // Web file input refs
  const fileInput1Ref = useRef(null);
  const fileInput2Ref = useRef(null);

  // Platform-specific alert function
  const showAlert = (title, message, buttons = [{ text: 'OK' }]) => {
    if (Platform.OS === 'web') {
      // For web, use window.alert or custom modal
      const buttonText = buttons.map(btn => btn.text).join(' / ');
      const result = window.confirm(`${title}\n\n${message}\n\n${buttonText}`);
      if (result && buttons[0].onPress) {
        buttons[0].onPress();
      }
    } else {
      Alert.alert(title, message, buttons);
    }
  };

  // Convert file to base64 for web
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Extract base64 string without data:image/...;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle web file selection
  const handleWebFileSelect = async (event, imageNumber) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showAlert('Invalid File', 'Please select an image file.');
      return;
    }

    // Create object URL for preview
    const imageUri = URL.createObjectURL(file);
    
    // Store image with web-specific data
    const imageData = {
      uri: imageUri,
      file: file, // Store the actual file for web
      type: 'web',
    };

    if (imageNumber === 1) {
      setFirstImage(imageData);
    } else {
      setSecondImage(imageData);
    }
  };

  // Function to pick an image from gallery or camera
  const pickImage = async (imageNumber) => {
    try {
      // For web, trigger file input
      if (Platform.OS === 'web') {
        if (imageNumber === 1) {
          fileInput1Ref.current?.click();
        } else {
          fileInput2Ref.current?.click();
        }
        return;
      }

      // For mobile platforms
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        showAlert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      // Show options to user (camera or gallery) - Mobile only
      Alert.alert(
        'Select Image',
        'Choose how you want to select the signature image',
        [
          { text: 'Camera', onPress: () => openCamera(imageNumber) },
          { text: 'Gallery', onPress: () => openGallery(imageNumber) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (error) {
      showAlert('Error', 'Failed to pick image: ' + error.message);
    }
  };

  // Function to open camera (Mobile only)
  const openCamera = async (imageNumber) => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      
      if (cameraPermission.granted === false) {
        showAlert('Permission Required', 'Permission to access camera is required!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: Platform.OS === 'web', // Get base64 directly on web
      });

      if (!result.canceled) {
        const imageData = {
          ...result.assets[0],
          type: 'mobile',
        };
        
        if (imageNumber === 1) {
          setFirstImage(imageData);
        } else {
          setSecondImage(imageData);
        }
      }
    } catch (error) {
      showAlert('Error', 'Failed to take photo: ' + error.message);
    }
  };

  // Function to open gallery
  const openGallery = async (imageNumber) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: Platform.OS === 'web', // Get base64 directly on web if possible
      });

      if (!result.canceled) {
        const imageData = {
          ...result.assets[0],
          type: 'mobile',
        };
        
        if (imageNumber === 1) {
          setFirstImage(imageData);
        } else {
          setSecondImage(imageData);
        }
      }
    } catch (error) {
      showAlert('Error', 'Failed to select image: ' + error.message);
    }
  };

  // Function to convert image to base64
  const convertToBase64 = async (imageData) => {
    try {
      // For web files
      if (imageData.type === 'web' && imageData.file) {
        return await fileToBase64(imageData.file);
      }
      
      // If base64 is already available (from web image picker)
      if (imageData.base64) {
        return imageData.base64;
      }
      
      // For mobile platforms
      if (Platform.OS !== 'web') {
        const base64 = await FileSystem.readAsStringAsync(imageData.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return base64;
      }
      
      throw new Error('Unable to convert image to base64');
    } catch (error) {
      throw new Error('Failed to convert image to base64: ' + error.message);
    }
  };

  // Function to verify signatures by calling your API
  const verifySignatures = async () => {
    // Check if both images are selected
    if (!firstImage || !secondImage) {
      showAlert('Missing Images', 'Please select both signature images before verification.');
      return;
    }

    setIsLoading(true);
    setVerificationResult(null);

    try {
      // Convert both images to base64
      const firstImageBase64 = await convertToBase64(firstImage);
      const secondImageBase64 = await convertToBase64(secondImage);

      // Prepare the request data
      const requestData = {
        image1: firstImageBase64,
        image2: secondImageBase64,
      };

      // Make API call to your backend
      const response = await fetch(`${API_BASE_URL}/verify-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (response.ok) {
        setVerificationResult(data.result);
        
        // Show result alert
        const resultMessage = data.result.is_genuine 
          ? '✅ Signatures are GENUINE (from the same person)'
          : '❌ One signature is FORGED (not authentic)';
        
        showAlert(
          'Verification Result',
          `${resultMessage}\n\nConfidence: ${(data.result.confidence * 100).toFixed(1)}%\nProcessing Time: ${data.result.processing_time_ms}ms`
        );
      } else {
        throw new Error(data.detail || 'Verification failed');
      }
    } catch (error) {
      showAlert('Verification Error', error.message);
      console.error('Verification error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to clear all data and start over
  const clearAll = () => {
    // Clean up object URLs on web
    if (Platform.OS === 'web') {
      if (firstImage?.uri) URL.revokeObjectURL(firstImage.uri);
      if (secondImage?.uri) URL.revokeObjectURL(secondImage.uri);
    }
    
    setFirstImage(null);
    setSecondImage(null);
    setVerificationResult(null);
    
    // Reset file inputs on web
    if (fileInput1Ref.current) fileInput1Ref.current.value = '';
    if (fileInput2Ref.current) fileInput2Ref.current.value = '';
  };

  // Component cleanup
  React.useEffect(() => {
    return () => {
      // Clean up object URLs when component unmounts
      if (Platform.OS === 'web') {
        if (firstImage?.uri) URL.revokeObjectURL(firstImage.uri);
        if (secondImage?.uri) URL.revokeObjectURL(secondImage.uri);
      }
    };
  }, [firstImage, secondImage]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
      
      {/* Hidden file inputs for web */}
      {Platform.OS === 'web' && (
        <>
          <input
            ref={fileInput1Ref}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleWebFileSelect(e, 1)}
          />
          <input
            ref={fileInput2Ref}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleWebFileSelect(e, 2)}
          />
        </>
      )}
      
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🔐 Signature Verification</Text>
          <Text style={styles.headerSubtitle}>Upload two signatures to verify authenticity</Text>
          {Platform.OS === 'web' && (
            <Text style={styles.platformIndicator}>Web Version</Text>
          )}
        </View>

        {/* Image Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Signature Images</Text>
          
          {/* First Image */}
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>First Signature (Reference)</Text>
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={() => pickImage(1)}
            >
              {firstImage ? (
                <Image source={{ uri: firstImage.uri }} style={styles.selectedImage} />
              ) : (
                <View style={styles.placeholderContainer}>
                  <Text style={styles.placeholderText}>📷</Text>
                  <Text style={styles.placeholderSubtext}>
                    {Platform.OS === 'web' 
                      ? 'Click to select image' 
                      : 'Tap to select image'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Second Image */}
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>Second Signature (To Verify)</Text>
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={() => pickImage(2)}
            >
              {secondImage ? (
                <Image source={{ uri: secondImage.uri }} style={styles.selectedImage} />
              ) : (
                <View style={styles.placeholderContainer}>
                  <Text style={styles.placeholderText}>📷</Text>
                  <Text style={styles.placeholderSubtext}>
                    {Platform.OS === 'web' 
                      ? 'Click to select image' 
                      : 'Tap to select image'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.verifyButton,
              (!firstImage || !secondImage || isLoading) && styles.disabledButton
            ]}
            onPress={verifySignatures}
            disabled={!firstImage || !secondImage || isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buttonText}>Verifying...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>🔍 Verify Signatures</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
            <Text style={styles.clearButtonText}>🗑️ Clear All</Text>
          </TouchableOpacity>
        </View>

        {/* Results Section */}
        {verificationResult && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification Results</Text>
            
            <View style={[
              styles.resultContainer,
              verificationResult.is_genuine ? styles.genuineResult : styles.forgedResult
            ]}>
              <Text style={styles.resultTitle}>
                {verificationResult.is_genuine ? '✅ GENUINE' : '❌ FORGED'}
              </Text>
              
              <Text style={styles.resultDescription}>
                {verificationResult.is_genuine 
                  ? 'Both signatures appear to be from the same person'
                  : 'The signatures are likely from different people'
                }
              </Text>

              <View style={styles.metricsContainer}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Confidence</Text>
                  <Text style={styles.metricValue}>
                    {(verificationResult.confidence * 100).toFixed(1)}%
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Processing Time</Text>
                  <Text style={styles.metricValue}>
                    {verificationResult.processing_time_ms}ms
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Similarity Score</Text>
                  <Text style={styles.metricValue}>
                    {verificationResult.similarity_score.toFixed(3)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Platform-specific instructions */}
        <View style={styles.section}>
          <Text style={styles.instructionsTitle}>How to Use:</Text>
          {Platform.OS === 'web' ? (
            <>
              <Text style={styles.instructionItem}>1. Click on the first image area to select a reference signature from your computer</Text>
              <Text style={styles.instructionItem}>2. Click on the second image area to select the signature to verify</Text>
              <Text style={styles.instructionItem}>3. Press "Verify Signatures" to analyze authenticity</Text>
              <Text style={styles.instructionItem}>4. View the results and confidence metrics</Text>
            </>
          ) : (
            <>
              <Text style={styles.instructionItem}>1. Tap on the first image area to select a reference signature</Text>
              <Text style={styles.instructionItem}>2. Choose Camera or Gallery to capture/select the image</Text>
              <Text style={styles.instructionItem}>3. Repeat for the second signature</Text>
              <Text style={styles.instructionItem}>4. Press "Verify Signatures" and view results</Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    padding: 20,
    ...(Platform.OS === 'web' && { maxWidth: 800, alignSelf: 'center', width: '100%' }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingVertical: 20,
    backgroundColor: '#2563eb',
    borderRadius: 15,
    marginHorizontal: -5,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#bfdbfe',
    textAlign: 'center',
  },
  platformIndicator: {
    fontSize: 12,
    color: '#93c5fd',
    marginTop: 5,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 15,
  },
  imageContainer: {
    marginBottom: 20,
  },
  imageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  imagePickerButton: {
    height: 200,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  selectedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
    resizeMode: 'contain',
  },
  placeholderContainer: {
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 40,
    marginBottom: 10,
  },
  placeholderSubtext: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  verifyButton: {
    backgroundColor: '#10b981',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  clearButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    padding: 20,
    borderRadius: 15,
    marginTop: 10,
  },
  genuineResult: {
    backgroundColor: '#dcfce7',
    borderLeftWidth: 5,
    borderLeftColor: '#10b981',
  },
  forgedResult: {
    backgroundColor: '#fee2e2',
    borderLeftWidth: 5,
    borderLeftColor: '#ef4444',
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1f2937',
  },
  resultDescription: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 20,
    lineHeight: 24,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 5,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  instructionItem: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 5,
    lineHeight: 20,
  },
});

export default SignatureVerificationApp;