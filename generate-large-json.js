#!/usr/bin/env node

/**
 * Generate a large JSON file for testing WASM performance
 * Target: 20MB with realistic nested structure
 */

import fs from 'fs';

// Helper to generate random string
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to generate random email
function randomEmail() {
  return `${randomString(8)}@${randomString(6)}.com`;
}

// Helper to generate random date
function randomDate() {
  const start = new Date(2020, 0, 1);
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

// Generate a single user object
function generateUser(id) {
  return {
    id: id,
    username: `user_${randomString(8)}`,
    email: randomEmail(),
    firstName: randomString(6),
    lastName: randomString(8),
    age: Math.floor(Math.random() * 60) + 18,
    isActive: Math.random() > 0.5,
    registeredAt: randomDate(),
    profile: {
      bio: randomString(100),
      avatar: `https://example.com/avatars/${randomString(16)}.jpg`,
      website: `https://${randomString(10)}.com`,
      location: {
        country: randomString(10),
        city: randomString(12),
        zipCode: String(Math.floor(Math.random() * 90000) + 10000),
        coordinates: {
          lat: (Math.random() * 180 - 90).toFixed(6),
          lng: (Math.random() * 360 - 180).toFixed(6)
        }
      },
      socialMedia: {
        twitter: `@${randomString(10)}`,
        linkedin: `linkedin.com/in/${randomString(12)}`,
        github: `github.com/${randomString(10)}`
      }
    },
    preferences: {
      theme: Math.random() > 0.5 ? 'dark' : 'light',
      language: ['en', 'es', 'fr', 'de', 'ja'][Math.floor(Math.random() * 5)],
      notifications: {
        email: Math.random() > 0.5,
        push: Math.random() > 0.5,
        sms: Math.random() > 0.5
      },
      privacy: {
        profileVisible: Math.random() > 0.5,
        showEmail: Math.random() > 0.5,
        allowMessages: Math.random() > 0.5
      }
    },
    posts: generatePosts(Math.floor(Math.random() * 20) + 5),
    followers: generateFollowers(Math.floor(Math.random() * 100) + 10),
    tags: generateTags(Math.floor(Math.random() * 10) + 3),
    stats: {
      postsCount: Math.floor(Math.random() * 500),
      followersCount: Math.floor(Math.random() * 10000),
      followingCount: Math.floor(Math.random() * 5000),
      likesReceived: Math.floor(Math.random() * 50000),
      commentsReceived: Math.floor(Math.random() * 20000)
    }
  };
}

// Generate posts array
function generatePosts(count) {
  const posts = [];
  for (let i = 0; i < count; i++) {
    posts.push({
      id: `post_${randomString(10)}`,
      title: randomString(30),
      content: randomString(200),
      createdAt: randomDate(),
      likes: Math.floor(Math.random() * 1000),
      comments: Math.floor(Math.random() * 100),
      tags: generateTags(Math.floor(Math.random() * 5) + 1),
      media: {
        type: ['image', 'video', 'none'][Math.floor(Math.random() * 3)],
        url: `https://example.com/media/${randomString(20)}`
      }
    });
  }
  return posts;
}

// Generate followers array
function generateFollowers(count) {
  const followers = [];
  for (let i = 0; i < count; i++) {
    followers.push({
      userId: Math.floor(Math.random() * 100000),
      username: `user_${randomString(8)}`,
      followedAt: randomDate()
    });
  }
  return followers;
}

// Generate tags array
function generateTags(count) {
  const tags = [];
  for (let i = 0; i < count; i++) {
    tags.push(randomString(8));
  }
  return tags;
}

// Main data structure
function generateData() {
  console.log('Generating large JSON file...');

  const data = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalUsers: 0,
      totalPosts: 0,
      totalFollowers: 0,
      dataSize: '~20MB'
    },
    users: [],
    analytics: {
      activeUsersToday: Math.floor(Math.random() * 10000),
      newRegistrationsToday: Math.floor(Math.random() * 1000),
      totalLikesToday: Math.floor(Math.random() * 100000),
      totalCommentsToday: Math.floor(Math.random() * 50000),
      topCountries: [
        { country: 'United States', users: 15234 },
        { country: 'United Kingdom', users: 8432 },
        { country: 'Canada', users: 6123 },
        { country: 'Germany', users: 5421 },
        { country: 'France', users: 4821 }
      ],
      topTags: generateTags(20).map((tag, i) => ({
        tag,
        count: Math.floor(Math.random() * 10000) + 1000
      }))
    },
    configuration: {
      maxFileSize: 10485760,
      allowedFileTypes: ['jpg', 'png', 'gif', 'mp4', 'webm'],
      rateLimit: {
        requests: 100,
        windowMs: 60000
      },
      features: {
        messaging: true,
        videoUploads: true,
        liveStreaming: false,
        stories: true,
        marketplace: false
      }
    }
  };

  // Calculate how many users we need to reach ~20MB
  // Start with a sample to estimate size
  const sampleUser = generateUser(0);
  const sampleSize = JSON.stringify(sampleUser).length;
  const targetSize = 20 * 1024 * 1024; // 20MB
  const estimatedUsers = Math.floor(targetSize / sampleSize);

  console.log(`Sample user size: ${(sampleSize / 1024).toFixed(2)} KB`);
  console.log(`Generating approximately ${estimatedUsers} users to reach 20MB...`);

  // Generate users
  let currentSize = JSON.stringify(data).length;
  let userCount = 0;

  while (currentSize < targetSize) {
    if (userCount % 100 === 0) {
      const progress = ((currentSize / targetSize) * 100).toFixed(1);
      console.log(`Progress: ${progress}% (${(currentSize / 1024 / 1024).toFixed(2)} MB / 20 MB)`);
    }

    data.users.push(generateUser(userCount));
    userCount++;

    // Update size estimate every 100 users
    if (userCount % 100 === 0) {
      currentSize = JSON.stringify(data).length;
    }
  }

  // Update metadata
  data.metadata.totalUsers = data.users.length;
  data.metadata.totalPosts = data.users.reduce((sum, user) => sum + user.posts.length, 0);
  data.metadata.totalFollowers = data.users.reduce((sum, user) => sum + user.followers.length, 0);

  return data;
}

// Generate and save
const data = generateData();
const json = JSON.stringify(data, null, 2); // Pretty-printed with 2-space indent
const sizeInMB = (json.length / 1024 / 1024).toFixed(2);

console.log(`\nGenerated JSON file:`);
console.log(`- Size: ${sizeInMB} MB`);
console.log(`- Users: ${data.metadata.totalUsers.toLocaleString()}`);
console.log(`- Posts: ${data.metadata.totalPosts.toLocaleString()}`);
console.log(`- Followers: ${data.metadata.totalFollowers.toLocaleString()}`);

const filename = 'test-data-20mb.json';
fs.writeFileSync(filename, json);

console.log(`\n✅ File saved as: ${filename}`);
console.log(`\nYou can now open this file in Tidy Code to test WASM performance!`);
